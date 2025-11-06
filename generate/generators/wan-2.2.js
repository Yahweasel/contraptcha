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

/**
 * Generate a latent or video.
 */
async function generate(opts) {
    const {
        oname, seed, positive, negative,
        backend, step, prompt
    } = opts;

    const w = JSON.parse(JSON.stringify(prompt.workflow[step]));
    const ext = (step === 2) ? ".mkv" : "_.latent";
    const suffix = `_0000${step+1}${ext}`;
    switch (step) {
        case 0:
            w[prompt.output[0]].inputs.filename_prefix = oname;
            w[prompt.seed[0]].inputs.noise_seed = seed;
            genImg.setText(w[prompt.prompt[0]], "@POSITIVE@", positive);
            genImg.setText(w[prompt.negative[0]], "@NEGATIVE@", negative);
            break;

        case 1:
            w[prompt.input[0]].inputs.latent = `${oname}_00001_.latent`;
            w[prompt.output[1]].inputs.filename_prefix = oname;
            w[prompt.seed[1]].inputs.noise_seed = seed;
            genImg.setText(w[prompt.prompt[1]], "@POSITIVE@", positive);
            genImg.setText(w[prompt.negative[1]], "@NEGATIVE@", negative);
            break;

        default: // 2
            w[prompt.input[1]].inputs.latent = `${oname}_00002_.latent`;
            w[prompt.output[2]].inputs.filename_prefix = oname;
    }

    // Check if it's already been made
    let exists = false;
    try {
        await fs.access(`${oname}${suffix}`, fs.constants.F_OK);
        exists = true;
    } catch (ex) {}

    if (!exists) {
        await genImg.sendPrompt(backend, w);

        // Wait for it to exist
        await genImg.waitForFile(`${oname}${suffix}`);
    }

    if (step === 2) {
        await fs.rename(`${oname}_00003.png`, `${oname}_00001_.png`);
        await fs.rename(`${oname}_00003.mkv`, `${oname}_00001_.mkv`);
    }
}

module.exports = {
    steps: 3,
    generate
};
