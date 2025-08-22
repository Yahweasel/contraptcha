#!/usr/bin/env node
/*
 * Copyright (c) 2025 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED “AS IS” AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER
 * RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF
 * CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import * as fs from "fs/promises";

import OpenAI from "openai";
import * as random from "random";

const host = "http://renderbox2.local:8000/v1";
const allModels = [
    "qwen3-235b",
    "glm4.5-air",
    "gemma3-27b",
    "gpt-oss-120b",
    "mistral-small"
];

function modelFixup(
    model: string,
    req: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
) {
    switch (model) {
        case "glm4.5-air":
            req.messages[0].content! += " /nothink";
            break;

        case "gpt-oss-120b":
            (<any> req).grammar = `root ::= "<|channel|>analysis<|message|><|start|>assistant<|channel|>final<|message|>" .*`;
            break;
    }
}

const words: string[] = [];

const formats = [
    "limerick",
    "tanka",
    "clerihew",
    "ABAB quatrain"
];

const template = `Write a @FORM@ about “@WORDS@”, without using any of the words “@WORDS@”. Do not give me any context or explanation, just the @FORM@. After the poem include attribution to a fictional name that fits the theme of the poem.`;
const oneTemplate = `Write a @FORM@ about “@WORDS@”, without using the word “@WORDS@”. Do not give me any context or explanation, just the @FORM@. After the poem include attribution to a fictional name that fits the theme of the poem.`;

let seed = -1;
let meta = "";

for (let ai = 2; ai < process.argv.length; ai++) {
    const arg = process.argv[ai];
    if (arg[0] === "-") {
        if (arg === "--seed") {
            seed = +process.argv[++ai];
        } else if (arg === "-m" || arg === "--meta") {
            meta = process.argv[++ai];
        } else {
            throw new Error(`Unrecognized argument ${arg}`);
        }
    } else {
        words.push(arg);
    }
}

function wordCheck(poem: string, censorWords: string[]) {
    const words = poem
        .toLowerCase()
        .replace(/[^\sa-z]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ");
    for (const censorWord of censorWords) {
        if (words.indexOf(censorWord) >= 0)
            return true;
    }
    return false;
}

async function main() {
    await fs.mkdir("out", {recursive: true});
    if (seed < 0) {
        seed = await (async () => {
            let seed: number;
            while (true) {
                seed = Math.floor(Math.random() * 2000000000);
                try {
                    await fs.mkdir(`out/${seed}`);
                    break;
                } catch (ex) {
                    // Already exists, try another seed
                }
            }
            return seed;
        })();
    }

    const rng = new random.Random(seed);
    const format = formats[rng.int(0, formats.length-1)];

    const models = allModels.slice(0);
    while (models.length > 4)
        models.splice(rng.int(0, models.length-1), 1);

    await fs.writeFile(`out/${seed}/info.json`, JSON.stringify({
        models,
        format,
        words,
        seed
    }, null, 2));

    if (meta)
        await fs.writeFile(`out/${seed}/meta.json`, meta);

    for (let mi = 0; mi < models.length; mi++) {
        const ps: Promise<unknown>[] = [];

        const model = models[mi];
        const mseed = seed + mi;
        const ai = new OpenAI({
            baseURL: host,
            apiKey: "none"
        });
        for (let wi = 1; wi < (1<<words.length); wi++) {
            while (ps.length > 2) {
                const idx = await Promise.race(ps.map((x, idx) => x.then(() => idx)));
                ps.splice(idx, 1);
            }

            const activeWords: string[] = [];
            for (let awi = 0; awi < words.length; awi++) {
                if (wi & (1<<awi))
                    activeWords.push(words[awi]);
            }

            const msg = (
                (activeWords.length === 1) ? oneTemplate : template
            ).replace(/@WORDS@/g, activeWords.join(", ")).replace(/@FORM@/g, format);

            ps.push((async () => {
                for (let si = 0;; si += 1000000) {
                    const req: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
                        model,
                        seed: mseed + si,
                        messages: [{
                            role: "user",
                            content: msg
                        }]
                    };
                    modelFixup(model, req);
                    const cmpl = await ai.chat.completions.create(req);

                    const poem = cmpl.choices[0].message.content!
                        .replace(/^<think>[\s\S]*<\/think>\s*/, "")
                        .replace(/^[\s\S]*<\|message\|>/, "")
                        .trim()
                        .split("\n")
                        .map(x => x.trim())
                        .join("\n");

                    if (wordCheck(poem, activeWords)) {
                        // Poem reveals a word
                        continue;
                    }

                    const fileBase = `out/${seed}/${mseed}_${wi.toString(16).padStart(2, "0")}`;

                    await fs.writeFile(`${fileBase}.txt`, poem);
                    await fs.writeFile(`${fileBase}.json`, JSON.stringify({
                        seed: mseed + si
                    }));
                    break;
                }

                console.error(`${mi}/${models.length} ${wi}/${1<<words.length}`);
            })());
        }

        await Promise.all(ps);
    }
}

main();
