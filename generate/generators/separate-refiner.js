/*
 * Copyright (c) 2025, 2026 Yahweasel
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
 * Generate a latent or image.
 */
async function generate(opts) {
    const {
        oname, seed, positive, negative,
        backend, step, prompt
    } = opts;

    const w = await genImg.loadWorkflow(`${prompt.model}-${step}`);
    const ext = (step === 3) ? "png" : "latent";
    const suffix = `_0000${step+1}_.` + ext;
    switch (step) {
        case 0: // unrefined generate
            w[prompt.output[0]].inputs.filename_prefix = oname;
            w[prompt.seed[0]].inputs.noise_seed =
                w[prompt.seed[0]].inputs.seed = seed;
            genImg.setText(w[prompt.prompt[0]], "@POSITIVE@", positive);
            genImg.setText(w[prompt.negative[0]], "@NEGATIVE@", negative);
            break;

        case 1: // VAE-to-VAE
            w[prompt.input[0]].inputs.latent = `${oname}_00001_.latent`;
            w[prompt.output[1]].inputs.filename_prefix = oname;
            break;

        case 2: // refine
            w[prompt.input[1]].inputs.latent = `${oname}_00002_.latent`;
            w[prompt.output[2]].inputs.filename_prefix = oname;
            w[prompt.seed[1]].inputs.noise_seed =
                w[prompt.seed[1]].inputs.seed = seed;
            genImg.setText(w[prompt.prompt[1]], "@POSITIVE@", positive);
            genImg.setText(w[prompt.negative[1]], "@NEGATIVE@", negative);
            break;

        default: // 3, VAE decode
            w[prompt.input[2]].inputs.latent = `${oname}_00003_.latent`;
            w[prompt.output[3]].inputs.filename_prefix = oname;
            break;
    }

    // Check if it's already been made
    let exists = false;
    try {
        await fs.access(`${oname}${suffix}`, fs.constants.F_OK);
        exists = true;
    } catch (ex) {}
    if (step === 3) {
        try {
            await fs.access(`${oname}_00001_.png`, fs.constants.F_OK);
            return true;
        } catch (ex) {}
    }

    if (!exists) {
        if (!await genImg.sendPrompt(backend, w))
            return false;
    }

    if (step < 3)
        return true;

    // Check if it's NSFW
    const nsfw = await genImg.run([
        "../nsfw/venv/bin/python3", "../nsfw/nsfw-detect.py",
        `${oname}${suffix}`
    ]);
    if (!nsfw) {
        await fs.rename(`${oname}_00004_.png`, `${oname}_00001_.png`);
        return true;
    }

    await fs.rename(`${oname}_00004_.png`, `${oname}_nsfw_0.png`);

    // Can't regenerate in multiple steps, so just censor-bar it
    await genImg.run([
        "../nsfw/venv/bin/python3",
        "../nsfw/nsfw-censor.py",
        `${oname}_nsfw_0.png`, `${oname}_00001_.png`
    ]);

    return true;
}

module.exports = {
    steps: 4,
    generate
};
