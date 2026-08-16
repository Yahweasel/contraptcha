/*
 * Copyright (c) 2026 Yahweasel
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

const genImg = require("../generate-img.js");

async function txtToPng(base) {
    const txt = `${base}.txt`;
    const svg = `${base}.svg`;
    const png = `${base}_00001_.png`;

    // First check if this has already been done
    try {
        await fs.access(png, fs.constants.F_OK);
        return;
    } catch (ex) {}

    // Next extract the svg
    const raw = await fs.readFile(txt, "utf8");
    let svgData = raw;
    let parts = /(<svg[\s\S]*<\/svg>)/.exec(raw);
    if (parts) {
        svgData = parts[1];
    } else {
        parts = /(<svg[\s\S]*)/.exec(raw);
        if (parts)
            svgData = parts[1];
    }
    await fs.writeFile(svg, svgData);

    // Convert to .png
    const p = cproc.spawn("inkscape", [
        "-o", png, "-w", "1152", "-h", "896", svg
    ], {stdio: ["ignore", "inherit", "inherit"]});
    await new Promise(res => p.on("exit", res));
}

async function generate(opts) {
    const {
        oname, seed, positive,
        backend, prompt
    } = opts;

    const w = await genImg.loadWorkflow(prompt.model);
    w[prompt.output].inputs.filename = oname;
    w[prompt.seed].inputs.seed = seed;
    genImg.setText(w[prompt.prompt], "@POSITIVE@", positive);

    // Check if it's already been made
    let exists = false;
    try {
        await fs.access(`${oname}.txt`, fs.constants.F_OK);
        exists = true;
    } catch (ex) {}

    if (!exists) {
        if (!await genImg.sendPrompt(backend, w))
            return false;
    }

    await txtToPng(oname);

    return true;
}

module.exports = {
    steps: 1,
    generate
};
