#!/usr/bin/env node
/*
 * Copyright (c) 2024-2025 Yahweasel
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

/*
 * NOTE:
 * These defaults are set up for using ComfyUI from StableSwarmUI. It should be
 * possible, but maybe not straightforward, to adapt it to ComfyUI directly.
 */

const fs = require("fs/promises");

const genImg = require("./generate-img.js");

const backends = require("./backends.json");

const models = require("./models.json");
const numWords = 6;

async function main(args) {
    // Handle arguments
    let meta = null;
    let outFile = null;
    let words = [];
    let seed = -1;

    for (let ai = 0; ai < args.length; ai++) {
        const arg = args[ai];
        if (arg === "-m") {
            const mstr = args[++ai];
            if (mstr)
                meta = JSON.parse(mstr);
        } else if (arg === "-s") {
            seed = +args[++ai];
        } else if (arg === "--json") {
            words = JSON.parse(await fs.readFile(args[++ai], "utf8"));
        } else if (arg === "-o") {
            outFile = args[++ai];
        } else if (arg[0] === "-") {
            process.exit(1);
        } else {
            words.push(arg);
        }
    }

    if (words.length !== numWords) {
        console.error(`Use: ./generate.js [-m metadata] <${numWords} words>`);
        process.exit(1);
        return;
    }

    // Choose an unused seed
    if (seed < 0) {
        do {
            seed = ~~(Math.random() * 2000000000);
            try {
                await fs.access(`out/${seed}/${seed}.json`, fs.constants.F_OK);
            } catch (ex) {
                break;
            }
        } while (true);
    }
    try {
        await fs.mkdir(`out/${seed}`);
    } catch (ex) {}
    await fs.writeFile(`out/${seed}/${seed}.json`, JSON.stringify(words));
    await fs.writeFile(`out/${seed}/cr.json`, JSON.stringify(models));
    if (meta)
        await fs.writeFile(`out/${seed}/meta.json`, JSON.stringify(meta));

    if (outFile)
        await fs.writeFile(outFile, JSON.stringify(seed));

    // Make all the images
    for (let si = 0; si < models.length; si++) {
        const model = models[si];
        const prompt = JSON.parse(await fs.readFile(`models/${model}.json`, "utf8"));
        let generator = genImg;
        if (prompt.generator)
            generator = require(`./generators/${prompt.generator}.js`);

        for (let step = 0; step < generator.steps; step++) {
            const ids = [];
            const promises = [];
            const queues = Array(backends.length).fill(0);
            for (let chidx = 1; chidx < (1<<numWords); chidx++) {
                // Wait for the queue to flush
                while (promises.length >= backends.length * 2)
                    await Promise.race(promises);

                // Choose a queue
                let queue = 0;
                let queueLen = queues[queue];
                for (let qi = 1; qi < queues.length; qi++) {
                    if (queues[qi] < queueLen) {
                        queue = qi;
                        queueLen = queues[qi];
                    }
                }

                // And add this to the queue
                const id = `${seed+si}_${chidx.toString(16).padStart(2, "0")}`;
                ids.push(id);
                queues[queue]++;
                promises.push((async () => {
                    const oname = `out/${seed}/${id}`;
                    await new Promise(res => setTimeout(res, 0));

                    try {
                        console.log(`Generating ${oname} (${step+1}/${generator.steps}, ${queue})`);

                        // Make the prompt
                        const parts = [];
                        for (let i = 0; i < numWords; i++) {
                            if (!(chidx & (1<<i))) continue;
                            parts.push(words[i]);
                        }

                        await generator.generate(
                            {
                                oname,
                                seed: seed + si,
                                positive: parts.join(", "),
                                negative: "text, watermark, nsfw, penis, vagina, breasts, nude, nudity",
                                step,
                                backend: backends[queue],
                                prompt
                            }
                        );

                    } finally {
                        const idx = ids.indexOf(id);
                        ids.splice(idx, 1);
                        queues[queue]--;
                        promises.splice(idx, 1);
                    }
                })());
            }

            await Promise.all(promises);
        }
    }
}
main(process.argv.slice(2));
