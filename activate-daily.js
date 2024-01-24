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

async function writeViaTmp(file, data) {
    await fs.writeFile(`${file}.tmp`, data);
    await fs.rename(`${file}.tmp`, file);
}

async function main(args) {
    // Get all the *ready* dailies
    const seeds = (await fs.readdir(`${args[0]}/dailies`))
        .filter(x => /\.json$/.test(x));
    if (seeds.length === 0) {
        // Out of dailies!
        try {
            await fs.unlink(`${args[0]}/daily.json`);
        } catch (ex) {}
        return;
    }

    // Choose one
    const idx = Math.floor(Math.random() * seeds.length);
    const seedFile = `${args[0]}/dailies/${seeds[idx]}`;
    const seed = JSON.parse(await fs.readFile(seedFile, "utf8"));

    // Make it the daily seed
    await writeViaTmp(`${args[0]}/daily.json`, JSON.stringify(seed));

    // Add it to the list of used daily seeds
    let prevDaily = "[]";
    try {
        prevDaily = await fs.readFile(`${args[0]}/dailies.json`, "utf8");
    } catch (ex) {}
    prevDaily = JSON.parse(prevDaily);
    prevDaily.push(seed);
    await writeViaTmp(`${args[0]}/dailies.json`, JSON.stringify(prevDaily));

    // And remove it from the list of upcoming dailies
    await fs.unlink(seedFile);
}
main(process.argv.slice(2));
