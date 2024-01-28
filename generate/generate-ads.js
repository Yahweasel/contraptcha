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

const backends = [
    "http://127.0.0.1:7821"
];

async function main(args) {
    // Get the word list
    let inWords = (await fs.readFile("../word-list/words.txt", "utf8"))
        .trim().split("\n");
    inWords =
        inWords.map(x => [x, "banner"]).concat(
        inWords.map(x => [x, "sidebar"]));
    const words = [];
    while (inWords.length) {
        const idx = Math.floor(Math.random() * inWords.length);
        words.push(inWords[idx]);
        inWords.splice(idx, 1);
    }

    try {
        await fs.mkdir(`out/ads`);
    } catch (ex) {}
    const promptText = await fs.readFile("workflow_api_ad.json", "utf8");

    const ids = [];
    const promises = [];

    // Generate
    for (let wi = 0; wi < words.length; wi++) {
        const word = words[wi][0];
        const adStyle = words[wi][1];
        const id = `${word}_${adStyle}`;
        try {
            await fs.access("STOP", fs.constants.F_OK);
            break;
        } catch (ex) {}

        // Wait for the queue to flush
        while (promises.length >= backends.length * 2)
            await Promise.race(promises);

        // And add this to the queue
        ids.push(id);
        promises.push((async () => {
            const oname = `out/ads/${word}_${adStyle[0]}ad`;
            await new Promise(res => setTimeout(res, 0));

            try {
                console.log(oname);

                // Make the prompt
                const prompt = JSON.parse(promptText);
                if (adStyle === "sidebar") {
                    prompt[5].inputs.width = 512;
                    prompt[5].inputs.height = 2048;
                } else {
                    prompt[5].inputs.width = 2508;
                    prompt[5].inputs.height = 418;
                }
                prompt[9].inputs.filename_prefix = oname;
                prompt[10].inputs.noise_seed =
                    Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                prompt[102].inputs.text = `${adStyle} advertisement for ${word}`;
                prompt[103].inputs.text = "text, panel, nsfw, penis, vagina, breasts";

                await genImg.generateImg(
                    oname, backends[wi%backends.length], prompt, 102
                );

            } finally {
                const idx = ids.indexOf(id);
                ids.splice(idx, 1);
                promises.splice(idx, 1);
            }
        })());
    }

    await Promise.all(promises);
}
main(process.argv.slice(2));
