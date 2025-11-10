/*
 * Copyright (c) 2024, 2025 Yahweasel
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

const cproc = require("child_process");
const fs = require("fs/promises");

/**
 * Send this prompt to the AI.
 */
async function sendPrompt(backend, prompt) {
    const f = await fetch(`${backend}/prompt`, {
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

/**
 * Run this command.
 */
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

/**
 * Set this text in a workflow.
 */
function setText(obj, from, to) {
    obj = obj.inputs;
    for (const part of ["prompt", "text", "text_g", "text_l"]) {
        if (obj[part])
            obj[part] = obj[part].replace(from, to);
    }
}

/**
 * Generate an image with this prompt.
 */
async function generate(opts) {
    const {
        oname, seed, positive, negative,
        backend, prompt
    } = opts;

    const w = JSON.parse(JSON.stringify(prompt.workflow));
    w[prompt.output].inputs.filename_prefix = oname;
    w[prompt.seed].inputs.noise_seed = seed;
    setText(w[prompt.prompt], "@POSITIVE@", positive);
    setText(w[prompt.negative], "@NEGATIVE@", negative);

    // Check if it's already been made
    let exists = false;
    try {
        await fs.access(`${oname}_00001_.png`, fs.constants.F_OK);
        exists = true;
    } catch (ex) {}

    if (!exists) {
        await sendPrompt(backend, w);

        // Wait for it to exist
        await waitForFile(`${oname}_00001_.png`);
    }

    // Check if it's NSFW
    const nsfw1 = await run([
        "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
        `${oname}_00001_.png`
    ]);
    if (!nsfw1) return;

    await fs.rename(`${oname}_00001_.png`, `${oname}_nsfw_0.png`);

    //console.log(`${oname} nsfw, regenerating...`);

    // OK, try more seeds
    const seedBase = w[prompt.seed].inputs.noise_seed;
    for (let seedAdd = 1000000000; seedAdd < 16000000000; seedAdd += 1000000000) {
        w[prompt.seed].inputs.noise_seed = seedBase + seedAdd;
        await sendPrompt(backend, prompt.workflow);
        await waitForFile(`${oname}_00001_.png`);

        // Still NSFW?
        const nsfw2 = await run([
            "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
            `${oname}_00001_.png`
        ]);
        if (!nsfw2) return;

        // Move away this one
        await fs.rename(`${oname}_00001_.png`, `${oname}_nsfw_${seedAdd}.png`);
    }

    //console.log(`${oname} still nsfw, censoring...`);

    // OK, give up, just censor-bar it
    await run([
        "../nsfw/venv/bin/python3",
        "../nsfw/nsfw-censor.py",
        `${oname}_nsfw_0.png`, `${oname}_00001_.png`
    ]);
}

module.exports = {
    steps: 1,
    sendPrompt,
    waitForFile,
    run,
    setText,
    generate
};
