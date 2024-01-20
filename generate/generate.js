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

const fs = require("fs/promises");

const backends = [
    "http://127.0.0.1:7821"
];
const models = [
    "juggernautXL_v8Rundiffusion.safetensors",
    "realvisxlV30Turbo_v30Bakedvae.safetensors",
    "nightvisionXLPhotorealisticPortrait_v0791Bakedvae.safetensors",
    "OfficialStableDiffusion/sd_xl_base_1.0.safetensors"
];
const numWords = 6;

async function main(args) {
    if (args.length !== numWords) {
        console.error(`Use: ./generate.js <${numWords} words>`);
        process.exit(1);
        return;
    }

    // Choose an unused seed
    let seed;
    do {
        seed = ~~(Math.random() * 2000000000);
        try {
            await fs.access(`out/${seed}/${seed}.json`, fs.constants.F_OK);
        } catch (ex) {
            break;
        }
    } while (true);
    await fs.mkdir(`out/${seed}`);
    await fs.writeFile(`out/${seed}/${seed}.json`, JSON.stringify(args));

    const promptText = await fs.readFile("workflow_api.json", "utf8");
    const prompt = JSON.parse(promptText);

    // Queue up all the prompts
    for (let si = 0; si < models.length; si++) {
        for (let chidx = 1; chidx < (1<<numWords); chidx++) {
            let parts = [];
            for (let i = 0; i < numWords; i++) {
                if (!(chidx & (1<<i))) continue;
                parts.push(args[i]);
            }
            //console.log(parts);
            prompt[4].inputs.ckpt_name = models[si];
            prompt[9].inputs.filename_prefix = `out/${seed}/${seed+si}_${chidx.toString(16).padStart(2, "0")}`;
            prompt[10].inputs.noise_seed = seed + si;
            prompt[101].inputs.text = parts.join(", ");
            prompt[102].inputs.text = "text, watermark, nsfw, penis, vagina, breasts";
            const f = await fetch(backends[chidx % backends.length] + "/prompt", {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({prompt: prompt})
            });
            const fbt = await f.text();
            //console.log(fbt);
        }
    }

    // Wait for them all to be generated
    for (let si = 0; si < models.length; si++) {
        for (let chidx = 1; chidx < (1<<numWords); chidx++) {
            console.log(`${si}/${models.length} ${chidx}/${1<<numWords}`);
            while (true) {
                try {
                    await fs.access(
                        `out/${seed}/${seed+si}_${chidx.toString(16).padStart(2, "0")}_00001_.png`,
                        fs.constants.F_OK
                    );
                    break;
                } catch (ex) {}
                await new Promise(res => setTimeout(res, 1000));
            }
        }
    }
}
main(process.argv.slice(2));
