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
        oname, seed, positive,
        backend, step, prompt
    } = opts;

    const w = await genImg.loadWorkflow(`${prompt.model}-${step}`);

    let out = "---";
    switch (step) {
        case 0:
            w[prompt.output[0]].inputs.filename = oname;
            w[prompt.seed[0]].inputs.seed = seed;
            genImg.setText(w[prompt.prompt], "@POSITIVE@", positive);
            out = `${oname}.ckpt`;
            break;

        case 1:
            w[prompt.input[0]].inputs.filename = `${oname}.ckpt`;
            w[prompt.output[1]].inputs.filename_prefix = oname;
            w[prompt.seed[1]].inputs.noise_seed = seed;
            out = `${oname}_00001_.latent`;
            break;

        case 2:
            w[prompt.input[1][0]].inputs.latent = `${oname}_00001_.latent`;
            w[prompt.input[1][1]].inputs.filename = `${oname}.ckpt`;
            w[prompt.output[2]].inputs.filename_prefix = oname;
            w[prompt.seed[2]].inputs.noise_seed = seed;
            out = `${oname}_00002_.latent`;
            break;

        default: // 3
            w[prompt.input[2]].inputs.latent = `${oname}_00002_.latent`;
            w[prompt.output[3]].inputs.filename_prefix = oname;
            out = `${oname}_00003.mkv`;
            break;
    }

    // Check if it's already been made
    let exists = false;
    try {
        await fs.access(out, fs.constants.F_OK);
        exists = true;
    } catch (ex) {}

    if (!exists) {
        if (step === 0) {
            for (let t = 0; t < 8; t++) {
                if (await genImg.sendPrompt(backend, w))
                    break;
                else if (t === 7)
                    return false;

                // Clear the cache
                try {
                    const f = await fetch(`${backend}/free`, {
                        method: "POST",
                        headers: {"content-type": "application/json"},
                        body: JSON.stringify({
                            unload_models: true,
                            free_memory: true
                        })
                    });
                    await f.text();
                } catch (ex) {}

            }
        } else {
            if (!await genImg.sendPrompt(backend, w))
                return false;
        }
    }

    if (step === 3) {
        await fs.rename(`${oname}_00003.png`, `${oname}_00001_.png`);
        await fs.rename(`${oname}_00003.mkv`, `${oname}_00001_.mkv`);
    }

    return true;
}

module.exports = {
    steps: 4,
    generate
};
