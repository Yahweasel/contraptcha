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

const genImg = require("./generate-img.js");

const width = 1152;
const height = 896;
const numWords = 6;
const negative = "text, watermark, nsfw, penis, vagina, breasts, nude, nudity";

const models = [
    {
        name: "shuttle3",
        m: "models/shuttle/shuttle3Diffusion_bf16.q8_0.gguf",
        "-vae": "models/flux/ae.safetensors",
        "-clip_l": "models/flux/clip_l.safetensors",
        "-t5xxl": "models/flux/t5xxl_fp16.safetensors",
        "-cfg-scale": "1.0",
        "-steps": "4"
    },
    {
        name: "pixelwave3schnell",
        m: "models/pixelwave/pixelwave_flux1Schnell03.q8_0.gguf",
        "-diffusion-model": "models/pixelwave/pixelwave_flux1Schnell03.q8_0.gguf",
        "-vae": "models/flux/ae.safetensors",
        "-clip_l": "models/flux/clip_l.safetensors",
        "-t5xxl": "models/flux/t5xxl_fp16.safetensors",
        "-cfg-scale": "1.0",
        "-steps": "6"
    },
    {
        name: "flux1schnell",
        m: "models/flux/flux1-schnell-q8_0.gguf",
        "-diffusion-model": "models/flux/flux1-schnell-q8_0.gguf",
        "-vae": "models/flux/ae.safetensors",
        "-clip_l": "models/flux/clip_l.safetensors",
        "-t5xxl": "models/flux/t5xxl_fp16.safetensors",
        "-cfg-scale": "1.0",
        "-steps": "4"
    },
    {name: "juggernautxl11", m: "models/juggernautXL_juggXIByRundiffusion.safetensors"},
];

const backends = [
    [
        "env",
        "-C", "../../sdinter",
        "LD_LIBRARY_PATH=/opt/rocm/llvm/lib:/opt/rocm/lib",
        "ROCR_VISIBLE_DEVICES=0",
        "./sdinter"
    ],
    [
        "env",
        "-C", "../../sdinter",
        "LD_LIBRARY_PATH=/opt/rocm/llvm/lib:/opt/rocm/lib",
        "ROCR_VISIBLE_DEVICES=1",
        "./sdinter"
    ]
];

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
    await fs.writeFile(`out/${seed}/cr.json`, JSON.stringify(models.map(x => x.name)));
    if (meta)
        await fs.writeFile(`out/${seed}/meta.json`, JSON.stringify(meta));

    if (outFile)
        await fs.writeFile(outFile, JSON.stringify(seed));

    // Make all the images
    // For each model...
    for (let mi = 0; mi < models.length; mi++) {
        const promises = [];

        const model = models[mi];
        const modelCmd = [
            "-W", width,
            "-H", height,
            "--sampling-method", "euler"
        ];
        for (const key in model) {
            if (key === "name") continue;
            modelCmd.push(`-${key}`, model[key]);
        }

        // For each image...
        for (let chidx = 1; chidx < (1<<numWords); chidx++) {
            const backendIdx = chidx % backends.length;

            // And add this to the queue
            const id = `${seed+mi}_${chidx.toString(16).padStart(2, "0")}`;

            const oname = `${process.cwd()}/out/${seed}/${id}`;

            console.log(`Generating ${seed}/${id}`);

            // Make the prompt
            const parts = [];
            for (let i = 0; i < numWords; i++) {
                if (!(chidx & (1<<i))) continue;
                parts.push(words[i]);
            }
            const prompt = {
                seed: seed+mi,
                prompt: parts.join(", "),
                negative
            };

            promises.push(genImg.generateImg(
                oname, backendIdx, backends[backendIdx], modelCmd, prompt
            ));
        }

        await genImg.flush();
        await Promise.all(promises);
        await genImg.flush(true);
    }
}
main(process.argv.slice(2));
