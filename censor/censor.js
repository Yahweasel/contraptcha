#!/usr/bin/env node
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
        const conf = part[2];
        if (conf < 0.05)
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
