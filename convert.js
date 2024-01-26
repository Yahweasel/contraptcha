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

const cproc = require("child_process");
const os = require("os");
const fs = require("fs/promises");

async function run(cmd) {
    const p = cproc.spawn(cmd[0], cmd.slice(1), {
        stdio: ["ignore", "inherit", "inherit"]
    });
    await new Promise(res => {
        p.on("exit", res);
    });
}

async function main() {
    // Read in the dictionary (for limiting hints)
    const dictionary = {};
    for (const word of (await fs.readFile("word-list/COMMON.TXT", "utf8")).split("\r\n")) {
        dictionary[word] = true;
    }

    const convCt = os.cpus().length;
    let convIDs = [];
    let convPromises = [];

    // Convert all the seeds
    const validSeeds = [];
    for (const file of await fs.readdir("generate/out")) {
        const seed = parseInt(file);
        try {
            await fs.access(
                `generate/out/${seed}/${seed}.json`, fs.constants.F_OK
            );
        } catch (ex) {
            continue;
        }

        let meta = {};
        try {
            meta = JSON.parse(await fs.readFile(
                `generate/out/${seed}/meta.json`, "utf8"
            ));
        } catch (ex) {}

        let valid = true;
        if (!meta.daily)
            validSeeds.push(seed);

        const outWords = `game/assets/${seed}/w.json`;
        try {
            await fs.access(outWords, fs.constants.F_OK);
            continue;
        } catch (ex) {}

        // 1: Make the assets directories
        await run(["mkdir", "-p", `game/assets/${seed}`]);
        await run(["mkdir", "-p", `censor/out/${seed}`]);

        // 2: Convert the PNG files
        pngloop: for (let si = 0; ; si++) {
            for (let pi = 1; ; pi++) {
                const pis = pi.toString(16).padStart(2, "0");
                const fbase = `${seed+si}_${pi.toString(16).padStart(2, "0")}`;
                const inFile = `generate/out/${seed}/${seed+si}_${pis}_00001_.png`;
                const cFile = `censor/out/${seed}/${si}_${pis}.png`;
                const outFile = `game/assets/${seed}/${si}_${pis}.webp`;

                // See if we're done
                try {
                    await fs.access(inFile, fs.constants.F_OK);
                } catch (ex) {
                    if (pi === 1)
                        break pngloop;
                    else
                        break;
                }

                while (convIDs.length >= convCt)
                    await Promise.race(convPromises);

                // Convert the file
                console.log(outFile);
                convIDs.push(outFile);
                convPromises.push((async () => {
                    await run([
                        "node", "./censor/censor.js",
                        inFile, cFile
                    ]);
                    await run(["convert", cFile, "-quality", "66", outFile]);

                    const idx = convIDs.indexOf(outFile);
                    convIDs.splice(idx, 1);
                    convPromises.splice(idx, 1);
                })());
            }
        }
        await Promise.all(convPromises);
        convIDs = [];
        convPromises = [];

        // 3: Make a thumbnail
        await run([
            "convert",
            `generate/out/${seed}/${seed}_3f_00001_.png`,
            "-resize", "x240",
            "-quality", "75",
            `game/assets/${seed}/thumb.webp`
        ]);

        // 4: Process all the words
        const words = JSON.parse(await fs.readFile(
            `generate/out/${seed}/${seed}.json`, "utf8"
        ));
        for (let wi = 0; wi < words.length; wi++) {
            const word = words[wi];
            console.log(`Word ${seed}/${wi+1}`);

            while (convIDs.length >= 2)
                await Promise.race(convPromises);

            convIDs.push(wi);
            convPromises.push((async () => {
                // Full dictionary
                const dj = `game/assets/${seed}/w${wi}`;
                const h = await fs.open(`${dj}.json`, "w");
                const hw = h.createWriteStream();
                const p = await cproc.spawn(
                    "semantic-distance/distance", [
                        "semantic-distance/GoogleNews-vectors-negative300.bin",
                        word
                    ], {
                        stdio: ["ignore", "pipe", "inherit"]
                    }
                );
                await new Promise(res => {
                    p.stdout.on("data", x => hw.write(x));
                    p.stdout.on("end", x => {
                        hw.end(x);
                        res();
                    });
                });

                // Split dictionary
                await run(["semantic-distance/split.js", dj]);

                // Get the top words for hints
                try {
                    const distances = JSON.parse(
                        await fs.readFile(`${dj}.json`, "utf8"));
                    const wordPairs = [];
                    for (const word in distances) {
                        if (dictionary[word])
                            wordPairs.push([word, distances[word]]);
                    }
                    wordPairs.sort((x, y) => y[1] - x[1]);
                    let max = 0;
                    try {
                        max = wordPairs[0][1];
                    } catch (ex) {}
                    const top = {};
                    for (
                        let wpi = 0;
                        wpi < wordPairs.length && wpi < 128;
                        wpi++
                    ) {
                        const wp = wordPairs[wpi];
                        if (wp[1] >= max - 0.2 || wpi < 16)
                            top[wp[0]] = wp[1];
                    }
                    await fs.writeFile(`${dj}-top.json`, JSON.stringify(top));
                } catch (ex) {
                    valid = false;
                }

                // Delete the now-unneeded full dictionary
                await fs.unlink(`${dj}.json`);

                // And mark ourself done
                const idx = convIDs.indexOf(wi);
                convIDs.splice(idx, 1);
                convPromises.splice(idx, 1);
            })());
        }
        await Promise.all(convPromises);
        convIDs = [];
        convPromises = [];

        // 5: Recombine distance lists
        for (let cc = "a".charCodeAt(0); cc <= "z".charCodeAt(0); cc++) {
            const c = String.fromCharCode(cc);
            const distance = Object.create(null);
            for (let wi = 0; wi < words.length; wi++) {
                const word = words[wi];
                const wd = JSON.parse(await fs.readFile(
                    `game/assets/${seed}/w${wi}-${c}.json`, "utf8"
                ));
                if (word[0] === c)
                    wd[words[wi]] = 1;
                for (const word in wd) {
                    if (!distance[word])
                        distance[word] = Array(words.length).fill(0);
                    distance[word][wi] = wd[word];
                }
            }
            await fs.writeFile(
                `game/assets/${seed}/w-${c}.json`,
                JSON.stringify(distance)
            );

            // We now don't need the split dictionary
            for (let wi = 0; wi < words.length; wi++)
                await fs.unlink(`game/assets/${seed}/w${wi}-${c}.json`);
        }

        // 6: Write out the wordlist
        if (valid)
            await run(["cp", `generate/out/${seed}/${seed}.json`, outWords]);
        else {
            if (!meta.daily)
                validSeeds.pop();
            console.error(`Seed ${seed} invalid!`);
        }

        /* 7: Add it to the dailies list. The dailies list is a directory so
         * that the conversion can run on one system while the daily selection
         * runs on a different system, and they can synchronize in a
         * straightforward way, never conflicting on a file. */
        if (meta.daily) {
            await run(["mkdir", "-p", "game/assets/dailies"]);
            await fs.writeFile(
                `game/assets/dailies/${seed}.json`,
                JSON.stringify(seed)
            );
        }
    }

    // Maybe exclude old seeds
    try {
        const excludeSeeds = JSON.parse(await fs.readFile(
            `game/assets/exclude-seeds.json`, "utf8"
        ));
        for (const seed of excludeSeeds) {
            const idx = validSeeds.indexOf(seed);
            if (idx >= 0)
                validSeeds.splice(idx, 1);
        }
    } catch (ex) {}

    // Write out the list of seeds
    await fs.writeFile("game/assets/seeds.json", JSON.stringify(validSeeds));

    // Convert the ads
    await run(["mkdir", "-p", "game/assets/ads"]);
    for (const file of await fs.readdir("generate/out/ads")) {
        if (!/_00001_\.png$/.test(file))
            continue;
        const inf = `generate/out/ads/${file}`;
        const outf = `game/assets/ads/${file.replace("_00001_.png", ".webp")}`;

        try {
            await fs.access(outf, fs.constants.F_OK);
            continue;
        } catch (ex) {}

        while (convIDs.length >= convCt)
            await Promise.race(convPromises);

        convIDs.push(outf);
        convPromises.push((async () => {
            console.log(outf);
            await run([
                "convert", inf,
                "-resize", "720x720",
                "-quality", "66",
                outf
            ]);
            await run([
                "/bin/sh", "-c",
                `exiftool ${inf} -Prompt -j > ${outf}.json`
            ]);

            const idx = convIDs.indexOf(outf);
            convIDs.splice(idx, 1);
            convPromises.splice(idx, 1);
        })());
    }
    await Promise.all(convPromises);
    convIDs = [];
    convPromises = [];
}
main();
