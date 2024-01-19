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

(async function() {
    const gebi = document.getElementById.bind(document);
    const dce = document.createElement.bind(document);

    const imageCt = 4;
    const wordCt = 6;

    // Get all our references
    const mainBox = gebi("main");
    const loadingBox = gebi("loading");
    const imgBoxes: HTMLElement[] = [];
    for (let i = 0; i < imageCt; i++)
        imgBoxes.push(gebi(`img${i+1}`));
    const wgBoxes: HTMLElement[] = [];
    for (let i = 0; i < wordCt; i++)
        wgBoxes.push(gebi(`wg${i+1}`));
    const winp: HTMLInputElement = gebi("wordinput");

    let mainPromise: Promise<unknown> = Promise.all([]);

    // Create an image for each imgBox
    const imgs: HTMLImageElement[] = [];
    for (let i = 0; i < imageCt; i++) {
        const img = imgs[i] = dce("img");
        imgBoxes[i].appendChild(img);
    }

    // Create five rows for each wordguess box
    const wgRows: HTMLElement[][] = [];
    for (let i = 0; i < wordCt; i++) {
        const wgCol: HTMLElement[] = [];
        wgRows.push(wgCol);
        for (let j = 0; j < 5; j++) {
            const row = dce("div");
            row.classList.add("wordguessel");
            row.innerHTML = "&nbsp;";
            wgCol.push(row);
            wgBoxes[i].appendChild(row);
        }
    }

    // Choose a seed
    const seed = await (async () => {
        const url = new URL(document.location.href);
        const paramSeed = url.searchParams.get("s");
        if (paramSeed) {
            return +paramSeed;
        }

        const seeds = await (await fetch("assets/seeds.json")).json();
        const seed = seeds[Math.floor(Math.random() * seeds.length)];

        url.searchParams.set("s", "" + seed);
        window.history.pushState({}, `??? — ${seed}`, url.toString());
        return seed;
    })();
    const words = await (await fetch(`assets/${seed}/w.json`)).json();

    const guessed: boolean[] = [];
    while (guessed.length < wordCt)
        guessed.push(false);

    const hidden: boolean[] = [];
    while (hidden.length < wordCt)
        hidden.push(false);

    const guessVals: [string, number][][] = [];
    while (guessVals.length < wordCt)
        guessVals.push([]);

    const guessWords: Record<string, boolean>[] = [];
    while (guessWords.length < wordCt)
        guessWords.push(Object.create(null));

    const similarity: Record<string, Record<string, number[]>> =
        Object.create(null);

    function drawImages() {
        let gidx = 0;
        for (let i = 0; i < wordCt; i++) {
            if (!guessed[i] && !hidden[i])
                gidx |= 1 << i;
        }
        if (gidx === 0)
            gidx = (1<<wordCt) - 1;
        let gs = gidx.toString(16);
        if (gs.length < 2)
            gs = `0${gs}`;
        for (let i = 0; i < 4; i++)
            imgs[i].src = `assets/${seed}/${i}_${gs}.webp`;
    }

    function drawWordGuesses(onlyWords?: boolean) {
        for (let wi = 0; wi < wordCt; wi++) {
            const wgCol = wgRows[wi];
            if (guessed[wi]) {
                wgCol[0].innerText = words[wi].toUpperCase();
                wgCol[0].style.backgroundColor = "#050";
            } else {
                wgCol[0].innerText = "??????";
                if (hidden[wi])
                    wgCol[0].style.backgroundColor = "#333";
                else
                    wgCol[0].style.backgroundColor = "#500";
            }
            if (onlyWords)
                continue;


            const wGuesses = guessVals[wi];
            for (let ri = 0; ri < 3; ri++) {
                const row = wgCol[ri+1];
                if (ri >= wGuesses.length) {
                    row.innerHTML = "&nbsp;";
                    row.style.backgroundColor = "";
                    continue;
                }
                const guess = wGuesses[ri];
                row.innerText = `${guess[0].toUpperCase()}: ${Math.round(guess[1]*100)}`;
                const sim = Math.min(guess[1] / 0.8, 1);
                if (sim > 0.5) {
                    row.style.backgroundColor = "rgb(" +
                        (1 - sim) * 33 + "% " +
                        "33% 0%)";
                } else {
                    row.style.backgroundColor = "rgb(" +
                        "33% " +
                        sim * 33 + "% " +
                        "0%)";
                }
            }
        }
    }

    function hideWord(toHide: number) {
        if (guessed[toHide])
            return;
        for (let wi = 0; wi < wordCt; wi++) {
            const wb = wgRows[wi][0];
            if (wi === toHide)
                hidden[wi] = !hidden[wi];
            else
                hidden[wi] = false;
        }
        drawImages();
        drawWordGuesses(true);
    }

    // Set up the ability to hide words
    for (let wi = 0; wi < wordCt; wi++)
        wgRows[wi][0].onclick = () => hideWord(wi);

    // Draw the initial state of the board
    drawImages();
    drawWordGuesses();
    loadingBox.style.display = "none";
    mainBox.style.display = "";
    winp.focus();

    // Function to make a guess
    async function guess(word: string) {
        // First check if they just got it
        let gotIt = words.indexOf(word);
        if (gotIt >= 0) {
            if (guessed[gotIt]) {
                // No doubles!
                return;
            }
            guessed[gotIt] = true;
            guessVals[gotIt] = [];
            for (let wi = 0; wi < wordCt; wi++) {
                const wb = wgRows[wi][4];
                wb.style.backgroundColor = "";
                wb.innerHTML = "&nbsp;";
                hidden[wi] = false;
            }
            drawImages();
            drawWordGuesses();
            return;
        }

        // Check if it's a valid word at all
        const first = word[0];
        if (!/[a-z]/.test(first))
            return;

        // Make sure we have this similarity file
        if (!similarity[first]) {
            similarity[first] =
                await (await fetch(`assets/${seed}/w-${first}.json`)).json();
        }

        // Check which is most similar
        const sword = similarity[first][word];
        if (!sword) {
            // No similarity, invalid word!
            // FIXME: Feedback
            return;
        }
        let mostVal = -1;
        let mostIdx = -1;
        for (let wi = 0; wi < wordCt; wi++) {
            if (guessed[wi])
                continue;
            if (sword[wi] > mostVal) {
                mostVal = sword[wi];
                mostIdx = wi;
            }
        }
        mostVal = Math.max(mostVal, 0);
        if (mostIdx < 0)
            return; // FIXME

        // Don't repeat guesses
        if (guessWords[mostIdx][word])
            return; // FIXME

        // Put it in place
        for (let wi = 0; wi < wordCt; wi++) {
            const wb = wgRows[wi][4];
            if (wi === mostIdx) {
                wb.style.backgroundColor = "#999";
                wb.style.color = "#000";
                wb.innerText = `${word.toUpperCase()}: ${Math.round(mostVal*100)}`;
            } else {
                wb.style.backgroundColor = "";
                wb.innerHTML = "&nbsp;";
            }
        }
        drawWordGuesses();

        // Add that to the guess-o-dex
        guessVals[mostIdx].push([word, mostVal]);
        guessVals[mostIdx].sort((x, y) => y[1] - x[1]);
        guessWords[mostIdx][word] = true;
    }

    // And play the game
    winp.onkeydown = ev => {
        if (/^[0-9]/.test(ev.key)) {
            // Change hidden state
            ev.preventDefault();
            hideWord(+ev.key - 1);
            return;
        }
        if (ev.key !== "Enter")
            return;
            
        const word = winp.value;
        winp.value = "";

        mainPromise = mainPromise.then(() => guess(word));
    };

    winp.onkeyup = ev => {
        winp.value = winp.value.replace(/[^A-Za-z]/g, "").toLowerCase();
    };
})();
