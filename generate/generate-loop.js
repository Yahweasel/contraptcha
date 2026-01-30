#!/usr/bin/env node
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

const LOOP = [{daily: true}, {hard: true}, null];

async function main() {
    const WORDS = (await fs.readFile("../word-list/words.txt", "utf8"))
        .split("\n")
        .map(x => x.trim());
    const env = Object.assign({}, process.env);
    env.ROCR_VISIBLE_DEVICES = "0";

    let todo = [];
    let lIdx = 0;

    try {
        await fs.unlink("STOP");
    } catch (ex) {}

    // First find any partially generated seeds to redo
    for (let seed of await fs.readdir("out")) {
        seed = +seed;
        let exists = false;

        // Check for the first file
        try {
            await fs.access(`out/${seed}/${seed}_01_00001_.png`);
            exists = true;
        } catch (ex) {}
        if (!exists)
            continue;

        // Check for the last file
        exists = false;
        try {
            //await fs.access(`out/${seed}/${seed+3}_3f_00001_.png`);
            await fs.access(`out/${seed}/${seed+3}_3f_00001_.png.ocr.json`);
            exists = true;
        } catch (ex) {}
        if (exists)
            continue;

        todo.push(seed);
    }

    // Generate until we're told to stop
    while (true) {
        // Check for the stop signal
        try {
            await fs.access("STOP");
            break;
        } catch (ex) {}

        // Make a task
        const args = ["-o", "seed.json"];
        if (todo.length) {
            const seed = todo.shift();
            args.push("-s", "" + seed);

        } else {
            const meta = LOOP[lIdx++];
            if (lIdx >= LOOP.length) lIdx = 0;

            if (meta)
                args.push("-m", JSON.stringify(meta));

            args.push("-o", "seed.json");

            // Set up the models file for standard/hard mode
            try {
                await fs.unlink("models.json");
            } catch (ex) {}
            if (meta && meta.hard)
                await fs.symlink("models-hard.json", "models.json");
            else
                await fs.symlink("models-standard.json", "models.json");

            // Choose words
            const allWords = WORDS.slice(0);
            const words = [];
            while (words.length < 6) {
                const wIdx = ~~(Math.random() * allWords.length);
                words.push(allWords[wIdx]);
                allWords.splice(wIdx, 1);
            }
            args.push.apply(args, words);
        }

        // Generate
        let proc = cproc.spawn("./generate.js", args, {
            stdio: "inherit"
        });
        await new Promise(res => proc.on("exit", res));

        // Get the seed
        const seed = JSON.parse(await fs.readFile("seed.json", "utf8"));

        // OCR
        proc = cproc.spawn("find", [
            `./generate/out/${seed}`, "-name", "*.png",
            "-exec", "./easyocr/venv/bin/python3", "./easyocr/eocr.py", "{}", "+"
        ], {
            stdio: "inherit",
            cwd: "..",
            env
        });
        await new Promise(res => proc.on("exit", res));
    }
}

main();
