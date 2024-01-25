#!/usr/bin/env node
/*
 * Copyright (c) 2024 Yahweasel
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

const cproc = require("child_process");
const fs = require("fs/promises");

const backends = [
    "http://127.0.0.1:7821"
];
const models = [
    "juggernautXL_v8Rundiffusion.safetensors",
    "realvisxlV30Turbo_v30Bakedvae.safetensors",
    "dreamshaperXL_sfwTurboDpmppSDE.safetensors",
    "OfficialStableDiffusion/sd_xl_base_1.0.safetensors"
];
const numWords = 6;

/**
 * Send this prompt to the AI.
 */
async function sendPrompt(prompt, idx) {
    const f = await fetch(backends[idx % backends.length] + "/prompt", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({prompt})
    });
    await f.text();
}

/**
 * Wait for this file to exist.
 */
async function waitForFile(name) {
    while (true) {
        try {
            await fs.access(name, fs.constants.F_OK);
            break;
        } catch (ex) {}
        await new Promise(res => setTimeout(res, 1000));
    }
    await new Promise(res => setTimeout(res, 1000));
}

function run(cmd) {
    return new Promise(res => {
        const p = cproc.spawn(cmd[0], cmd.slice(1), {
            stdio: ["ignore", "inherit", "inherit"]
        });
        p.on("exit", (code, signal) => {
            if (code === null)
                res(-1);
            else
                res(code);
        });
    });
}

async function main(args) {
    // Handle arguments
    let meta = null;
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
    if (meta)
        fs.writeFile(`out/${seed}/meta.json`, JSON.stringify(meta));

    const promptText = await fs.readFile("workflow_api.json", "utf8");

    // Make all the images
    const ids = [];
    const promises = [];
    for (let si = 0; si < models.length; si++) {
        for (let chidx = 1; chidx < (1<<numWords); chidx++) {
            // Wait for the queue to flush
            while (promises.length >= backends.length * 2)
                await Promise.race(promises);

            // And add this to the queue
            const id = `${seed+si}_${chidx.toString(16).padStart(2, "0")}`;
            ids.push(id);
            promises.push((async () => {
                const oname = `out/${seed}/${id}_`;
                await new Promise(res => setTimeout(res, 0));

                try {
                    // Check if it's already been made
                    let exists = false;
                    try {
                        await fs.access(`${oname}00001_.png`, fs.constants.F_OK);
                        exists = true;
                    } catch (ex) {}
                    if (exists)
                        return;

                    console.log(oname);

                    // Make the prompt
                    const parts = [];
                    for (let i = 0; i < numWords; i++) {
                        if (!(chidx & (1<<i))) continue;
                        parts.push(words[i]);
                    }
                    const prompt = JSON.parse(promptText);
                    prompt[4].inputs.ckpt_name = models[si];
                    prompt[9].inputs.filename_prefix = `out/${seed}/${id}`;
                    prompt[10].inputs.noise_seed = seed + si;
                    prompt[101].inputs.text = parts.join(", ");
                    prompt[102].inputs.text = "text, watermark, nsfw, penis, vagina, breasts";
                    await sendPrompt(prompt, chidx);

                    // Wait for it to exist
                    await waitForFile(`${oname}00001_.png`);

                    // Check if it's NSFW
                    const nsfw1 = await run([
                        "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
                        `${oname}00001_.png`
                    ]);
                    if (!nsfw1) return;

                    //console.log(`${oname} nsfw, regenerating...`);

                    // OK, add "sfw" to the prompt then...
                    await fs.rename(`${oname}00001_.png`, `${oname}nsfw.png`);
                    prompt[101].inputs.text += ", sfw";
                    await sendPrompt(prompt, chidx);
                    await waitForFile(`${oname}00001_.png`);

                    // Still NSFW?
                    const nsfw2 = await run([
                        "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
                        `${oname}00001_.png`
                    ]);
                    if (!nsfw2) return;

                    //console.log(`${oname} still nsfw, censoring...`);

                    // OK, give up, just censor-bar it
                    await fs.rename(`${oname}00001_.png`, `${oname}uncensored.png`);
                    await run([
                        "../nsfw/venv/bin/python3",
                        "../nsfw/nsfw-censor.py",
                        `${oname}uncensored.png`, `${oname}00001_.png`
                    ]);

                } finally {
                    const idx = ids.indexOf(id);
                    ids.splice(idx, 1);
                    promises.splice(idx, 1);
                }
            })());
        }
    }

    await Promise.all(promises);
}
main(process.argv.slice(2));
