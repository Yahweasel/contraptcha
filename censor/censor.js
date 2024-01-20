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

const fs = require("fs/promises");
const canvas = require("canvas");

async function main(args) {
    const ocr = JSON.parse(await fs.readFile(
        `${args[0]}.ocr.json`, "utf8"
    ));

    // Start with the base image
    const img = await canvas.loadImage(args[0]);
    const cv = canvas.createCanvas(img.width, img.height);
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // For each OCR'd segment...
    for (const part of ocr) {
        const bbox = part[0];
        const txt = part[1];
        const conf = part[2];

        // Skip bad or irrelevant
        if (conf < 0.05 ||
            txt.length < 3 ||
            !/[a-zA-Z]/.test(txt))
            continue;

        // Turn the bounding box into a path
        ctx.beginPath();
        ctx.fillStyle = "black";
        ctx.moveTo(bbox[0][0], bbox[0][1]);
        for (const loc of bbox.slice(1))
            ctx.lineTo(loc[0], loc[1]);
        ctx.closePath();
        ctx.fill();
    }

    // And write it out
    const fh = await fs.open(args[1], "w");
    cv.createPNGStream().pipe(fh.createWriteStream());
}
main(process.argv.slice(2));
