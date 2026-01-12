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

const fs = require("fs/promises");

const genImg = require("../generate-img.js");

async function generate(opts) {
    const {
        oname, seed, positive,
        backend, prompt
    } = opts;

    const w = await genImg.loadWorkflow(prompt.model);
    w[prompt.output].inputs.filename_prefix = oname;
    w[prompt.seed].inputs.seed = seed;
    genImg.setText(w[prompt.prompt], "@POSITIVE@", positive);

    // Check if it's already been made
    let exists = false;
    try {
        await fs.access(`${oname}_00001_.png`, fs.constants.F_OK);
        exists = true;
    } catch (ex) {}

    if (!exists) {
        if (!await genImg.sendPrompt(backend, w))
            return false;
    }

    // Check if it's NSFW
    const nsfw1 = await genImg.run([
        "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
        `${oname}_00001_.png`
    ]);
    if (!nsfw1) return true;

    await fs.rename(`${oname}_00001_.png`, `${oname}_nsfw_0.png`);

    // OK, try more seeds
    const seedBase = w[prompt.seed].inputs.seed;
    for (let seedAdd = 1000000000; seedAdd < 16000000000; seedAdd += 1000000000) {
        w[prompt.seed].inputs.seed = seedBase + seedAdd;
        if (!await genImg.sendPrompt(backend, w))
            return false;

        // Still NSFW?
        const nsfw2 = await genImg.run([
            "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
            `${oname}_00001_.png`
        ]);
        if (!nsfw2) return true;

        // Move away this one
        await fs.rename(`${oname}_00001_.png`, `${oname}_nsfw_${seedAdd}.png`);
    }

    // OK, give up, just censor-bar it
    await genImg.run([
        "../nsfw/venv/bin/python3",
        "../nsfw/nsfw-censor.py",
        `${oname}_nsfw_0.png`, `${oname}_00001_.png`
    ]);

    return true;
}

module.exports = {
    steps: 1,
    generate
};
