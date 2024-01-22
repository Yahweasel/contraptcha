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

declare let localforage: any;
declare let textMetrics: any;

(async function() {
    const gebi = document.getElementById.bind(document);
    const dce = document.createElement.bind(document);
    const lf = localforage.createInstance({
        name: "contraptcha"
    });

    const imageCt = 4;
    const wordCt = 6;

    // Get all our references
    const mainBox = gebi("main");
    const panelGuard = gebi("panelguard");
    const panelBox1 = gebi("panelbox1");
    const panelBox3 = gebi("panelbox3");
    const imgBoxes: HTMLElement[] = [];
    for (let i = 0; i < imageCt; i++)
        imgBoxes.push(gebi(`img${i+1}`));
    const wgBoxes: HTMLElement[] = [];
    for (let i = 0; i < wordCt; i++)
        wgBoxes.push(gebi(`wg${i+1}`));
    const winp: HTMLInputElement = gebi("wordinput");
    const scoreDisp = gebi("scoredisplay");

    const loadingPanel = gebi("loadingpanel");
    const helpPanel = gebi("helppanel");
    const creditsPanel = gebi("creditspanel");
    const msgPanel = gebi("messagepanel");
    const msgPanelMsg = gebi("messagepanelmessage");
    const imgPanel = gebi("imgpanel");
    const imgPanelImg = gebi("imgpanelimg");

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

    // Game state
    let state: {
        guessed: boolean[],
        guessVals: [string, number][][],
        guessWords: Record<string, boolean>[],
        score: number,
        retried: boolean
    } | null = null;

    const hidden: boolean[] = [];
    while (hidden.length < wordCt)
        hidden.push(false);

    let lastGuess: [number, [string, number]] | null = null;

    let seed = 0;
    let words: string[] = [];
    let similarity: Record<string, Record<string, number[]>> =
        Object.create(null);
    let hintFiles: Record<number, [string, number]> = {};
    let beatEveryPuzzle = false;

    let modalPanel = false;

    /**
     * Load the state for the current game. If the player hasn't played this
     * game, load a blank state.
     */
    async function loadState() {
        state = await lf.getItem(`game-${seed}`);
        if (!state) {
            state = {
                guessed: [],
                guessVals: [],
                guessWords: [],
                score: 100,
                retried: false
            };
        }

        // Update old versions
        if (!("score" in <any> state)) {
            state.score = 100;
            state.retried = false;
        }

        while (state.guessed.length < wordCt)
            state.guessed.push(false);

        while (state.guessVals.length < wordCt)
            state.guessVals.push([]);

        while (state.guessWords.length < wordCt)
            state.guessWords.push(Object.create(null));
    }

    /**
     * Choose a random seed (or the seed given by the URL) and load it.
     * @param ignoreURL  Don't use the seed in the URL.
     */
    async function chooseSeed(ignoreURL = false) {
        const url = new URL(document.location.href);
        seed = -1;
        if (!ignoreURL) {
            if (url.hash.length >= 2) {
                seed = +url.hash.slice(1);
                await loadState();
            } else {
                const paramSeed = url.searchParams.get("s");
                if (paramSeed) {
                    seed = +paramSeed;
                    await loadState();
                }
            }
        }

        // Choose a seed we haven't beaten yet
        if (seed < 0) {
            const seeds = await loadJSON("assets/seeds.json?v=s");
            do {
                if (!seeds.length)
                    break;
                const idx = Math.floor(Math.random() * seeds.length);
                seed = seeds[idx];
                seeds.splice(idx, 1);
                await loadState();
            } while (state.guessed.indexOf(false) < 0);

            if (state.guessed.indexOf(false) < 0)
                beatEveryPuzzle = true;
        }

        url.hash = `#${seed}`;
        url.search = "";
        window.history.pushState({}, `??? — ${seed}`, url.toString());

        words = await loadJSON(`assets/${seed}/w.json`);
        similarity = Object.create(null);
        hintFiles = {};
    }

    /**
     * Save the current game state.
     */
    async function saveState() {
        await lf.setItem(`game-${seed}`, state);
    }

    /**
     * Show this panel, or hide the panel.
     * @param to  Panel to show, or null to hide.
     */
    function panel(to: HTMLElement | null, modal = false) {
        panelBox3.innerHTML = "";
        if (to) {
            panelBox3.appendChild(to);
            panelGuard.style.display = "";
            panelBox1.style.display = "";
            imgPanel.style.display = "none";
            setTimeout(() => {
                winp.blur();
                to.focus();
            }, 0);
            modalPanel = modal;
        } else {
            panelGuard.style.display = "none";
            panelBox1.style.display = "none";
            imgPanel.style.display = "none";
            setTimeout(() => winp.focus(), 0);
            modalPanel = false;
        }
    }

    /**
     * Show this message.
     * @param msg  Message to show (HTML)
     */
    function message(msg: string) {
        msgPanelMsg.innerHTML = msg;
        panel(msgPanel);
    }

    /**
     * Load this file as JSON, showing a loading screen if needed.
     */
    async function loadJSON(url: string) {
        let timeout: number | null = setTimeout(() => {
            timeout = null;
            panel(loadingPanel, true);
        }, 500);

        const f = await fetch(url);
        const ret = await f.json();

        if (timeout)
            clearTimeout(timeout);
        else
            panel(null);

        return ret;
    }

    /**
     * Draw the images described by the current state.
     */
    function drawImages() {
        const won = state.guessed.indexOf(false) < 0;
        let gidx = 0;
        for (let i = 0; i < wordCt; i++) {
            if ((won || !state.guessed[i]) && !hidden[i])
                gidx |= 1 << i;
        }
        if (gidx === 0)
            gidx = (1<<wordCt) - 1;
        let gs = gidx.toString(16);
        if (gs.length < 2)
            gs = `0${gs}`;
        for (let i = 0; i < 4; i++) {
            const src = `assets/${seed}/${i}_${gs}.webp`;
            imgs[i].src = src;
            imgs[i].onclick = () => {
                imgPanelImg.src = src;
                panelGuard.style.display = "";
                imgPanel.style.display = "";
                imgPanel.onclick = imgPanelImg.onclick = () => {
                    panelGuard.style.display = "none";
                    imgPanel.style.display = "none";
                };
            };
        }
    }

    /**
     * Draw a single word guess element.
     */
    function drawWordGuess(
        el: HTMLElement & {cpTextMetrics?: any}, text: string, bgColor: string,
        fgColor = ""
    ) {
        el.innerText = text;
        el.style.fontSize = "";
        el.style.backgroundColor = bgColor;
        el.style.color = fgColor;
        el.style.animation = "";

        if (!text)
            return;

        (async function() {
            if (el.clientWidth <= 0)
                await new Promise(res => setTimeout(res, 0));
            if (el.clientWidth <= 0)
                return;
            if (!el.cpTextMetrics)
                el.cpTextMetrics = textMetrics.init(el);
            const tm = el.cpTextMetrics;
            if (el.cpTextMetrics.width(text) > el.clientWidth - 8)
                el.style.fontSize = el.cpTextMetrics.maxFontSize(text);
        })();
    }

    /**
     * Draw the word guesses described by the current state.
     */
    function drawWordGuesses(onlyWords?: boolean) {
        const won = state.guessed.indexOf(false) < 0;
        for (let wi = 0; wi < wordCt; wi++) {
            const wgCol = wgRows[wi];
            if (state.guessed[wi]) {
                drawWordGuess(
                    wgCol[0], words[wi].toUpperCase(),
                    (won && hidden[wi]) ? "#333" : "#050"
                );
            } else {
                drawWordGuess(
                    wgCol[0], "??????",
                    hidden[wi] ? "#333" : "#500"
                );
            }
            if (onlyWords)
                continue;

            let sawLastGuess = false, repeatLastGuess = false;;
            const wGuesses = state.guessVals[wi];
            for (let ri = 0; ri < 4; ri++) {
                const row = wgCol[ri+1];
                if (ri >= wGuesses.length) {
                    drawWordGuess(row, "", "");
                    continue;
                }

                /* If we're in the last row, we show the most recent guess even
                 * if it's bad */
                let guess = wGuesses[ri];
                if (ri === 3) {
                    if (repeatLastGuess || !lastGuess || lastGuess[0] !== wi) {
                        drawWordGuess(row, "", "");
                        break;
                    }
                    if (!sawLastGuess)
                        guess = lastGuess[1];
                }

                // Was this the most recent guess?
                let wasLastGuess = false;
                if (lastGuess && lastGuess[0] === wi &&
                    lastGuess[1][0] === guess[0]) {
                    wasLastGuess = sawLastGuess = true;
                }

                // Draw this word
                const text =
                    `${guess[0].toUpperCase()}: ${Math.round(guess[1]*100)}`;
                let bgColor: string, fgColor: string = "";
                const sim = Math.min(guess[1] / 0.8, 1);
                if (wasLastGuess) {
                    bgColor = "#999";
                    fgColor = "#000";
                    if (row.innerText === text) {
                        /* Bit of a cheat: if they're guessing a word they
                         * already saw, we set repeatLastGuess to prevent it
                         * from showing #4 */
                        repeatLastGuess = true;
                    }
                } else if (sim > 0.5) {
                    bgColor = "rgb(" +
                        (1 - sim) * 33 + "% " +
                        "33% 0%)";
                } else {
                    bgColor = "rgb(" +
                        "33% " +
                        sim * 33 + "% " +
                        "0%)";
                }
                drawWordGuess(row, text, bgColor, fgColor);

                /* If we're in the last row and this wasn't the last guess, fade
                 * it out */
                if (ri === 3 && !wasLastGuess)
                    row.style.animationName = "fadeOut";
            }
        }

        // Also draw the score while we're here
        {
            const sim = Math.max(state.score / 100, 0);
            let bgColor: string;
            if (sim > 0.5)
                bgColor = `rgb(${(1 - sim) * 33}% 33% 0%)`;
            else
                bgColor = `rgb(33% ${sim * 33}% 0%)`;
            drawWordGuess(
                scoreDisp,
                "" + state.score + (state.retried ? "*" : ""),
                bgColor
            );
        }
    }

    /**
     * Hide (block, censor) this word.
     * @param toHide  Word to hide (offset)
     */
    function hideWord(toHide: number) {
        if (state.guessed.indexOf(false) < 0) {
            /* When you've beaten the game, you can hide anything (see all
             * images) */
            hidden[toHide] = !hidden[toHide];
        } else {
            if (state.guessed[toHide])
                return;
            for (let wi = 0; wi < wordCt; wi++) {
                const wb = wgRows[wi][0];
                if (wi === toHide)
                    hidden[wi] = !hidden[wi];
                else
                    hidden[wi] = false;
            }
        }
        drawImages();
        drawWordGuesses(true);
    }

    /**
     * Make a guess.
     * @param word  Word to guess.
     */
    async function guess(word: string, scoreChange?: number) {
        // First check if they just got it
        let gotIt = words.indexOf(word);
        if (gotIt >= 0 && !state.guessed[gotIt]) {
            state.guessed[gotIt] = true;
            state.guessVals[gotIt] = [];
            lastGuess = null;
            hidden.fill(false);
            drawImages();
            drawWordGuesses();
            await saveState();
            return;
        }

        // Check if it's a valid word at all
        if (/[^a-z]/.test(word)) {
            message("Invalid word! Hyphens, apostrophes, and other symbols are not allowed.");
            return;
        }
        const first = word[0];

        // Make sure we have this similarity file
        if (!similarity[first]) {
            similarity[first] =
                await loadJSON(`assets/${seed}/w-${first}.json`);
        }

        // Check which is most similar
        const sword = similarity[first][word];
        if (!sword) {
            // No similarity, invalid word!
            message("Unrecognized word!");
            return;
        }
        let mostVal = -1;
        let mostIdx = -1;
        for (let wi = 0; wi < wordCt; wi++) {
            if (state.guessed[wi])
                continue;
            if (sword[wi] > mostVal) {
                mostVal = sword[wi];
                mostIdx = wi;
            }
        }
        mostVal = Math.max(mostVal, 0);
        if (mostIdx < 0)
            return;

        // Put it in place
        lastGuess = [mostIdx, [word, mostVal]];

        // Don't repeatedly add guesses to the list
        if (!state.guessWords[mostIdx][word]) {
            // Add it to the guess-o-dex
            state.guessVals[mostIdx].push(lastGuess[1]);
            state.guessVals[mostIdx].sort((x, y) => y[1] - x[1]);
            state.guessWords[mostIdx][word] = true;

            // And affect the score
            if (typeof scoreChange !== "number")
                scoreChange = Math.ceil((60 - Math.round(mostVal * 100)) / 10);
            if (scoreChange > 0)
                state.score -= scoreChange;
        }
        drawWordGuesses();
        await saveState();
    }

    /**
     * Give a hint.
     */
    async function hint() {
        let wi = Math.floor(Math.random() * wordCt);
        if (lastGuess)
            wi = lastGuess[0];
        if (!hintFiles[wi])
            hintFiles[wi] = await loadJSON(`assets/${seed}/w${wi}-top.json`);

        // Choose a random word to use as hint
        let hintWords = Object.keys(hintFiles[wi]);
        let hintWord = "";
        let hintValue: number;
        while (true) {
            if (!hintWords.length)
                break;
            const idx = Math.floor(Math.random() * hintWords.length);
            hintWord = hintWords[idx];
            hintValue = hintFiles[wi][hintWord];
            if (state.guessWords[hintWord]) {
                hintWords.splice(idx, 1);
                delete hintFiles[wi][hintWord];
            } else break;
        }
        if (!hintWord) {
            message("I've run out of hint words :(");
            return;
        }

        // Affect the score
        hintValue = Math.round(hintValue * 100);
        const scoreChange = Math.floor(hintValue / 10) * 3;

        guess(hintWord, scoreChange);
    }

    /**
     * Restart the game.
     */
    async function restart() {
        state.guessed.fill(false);
        hidden.fill(false);
        for (let wi = 0; wi < wordCt; wi++) {
            state.guessVals[wi] = [];
            state.guessWords[wi] = Object.create(null);
        }
        state.score = 100;
        state.retried = true;
        lastGuess = null;
        await saveState();
        drawImages();
        drawWordGuesses();
        setTimeout(() => winp.focus(), 0);
    }

    /**
     * Start a new game.
     */
    async function newGame() {
        hidden.fill(false);
        lastGuess = null;
        await chooseSeed(true);
        await drawImages();
        await drawWordGuesses();
    }

    // Choose the initial seed
    await chooseSeed();

    // Set up the ability to hide words
    for (let wi = 0; wi < wordCt; wi++)
        wgRows[wi][0].onclick = () => hideWord(wi);

    // Draw the initial state of the board
    drawImages();
    drawWordGuesses();
    mainBox.style.display = "";
    panelBox1.onclick = () => !modalPanel && panel(null);
    window.addEventListener("keydown", ev => {
        if (!modalPanel && (ev.key === "Escape" || ev.key === "Enter"))
            panel(null);
    });
    window.addEventListener("resize", () => drawWordGuesses());

    // Special circumstances
    if (beatEveryPuzzle) {
        message("Congratulations! You've beaten every puzzle currently in the game!");
    } else if (!(await lf.getItem("seen-help"))) {
        panel(helpPanel);
        await lf.setItem("seen-help", true);
    } else {
        panel(null);
    }

    // Set up the buttons
    gebi("restartbtn").onclick = restart;
    gebi("newbtn").onclick = newGame;
    gebi("hintbtn").onclick = hint;
    gebi("helpbtn").onclick = () => panel(helpPanel);
    gebi("creditsbtn").onclick = () => panel(creditsPanel);

    // And play the game
    winp.onkeydown = ev => {
        if (/^[0-9]/.test(ev.key)) {
            // Change hidden state
            ev.preventDefault();
            hideWord(+ev.key - 1);
            return;
        }
        if (ev.key === "Escape") {
            panel(null);
            return;
        }
        if (ev.key !== "Enter")
            return;
        ev.preventDefault();
        ev.stopPropagation();
            
        const word = winp.value;
        winp.value = "";
        if (!word.length)
            return;

        mainPromise = mainPromise.then(() => {
            if (word[0] === "/") {
                // Commands
                const cmd = word.slice(1).toLowerCase();
                if (cmd === "restart")
                    return restart();
                else if (cmd === "newgame" || cmd === "new")
                    return newGame();
                else if (cmd === "hint")
                    return hint();
                else if (cmd === "help")
                    panel(helpPanel);
                else if (cmd === "credits")
                    panel(creditsPanel);
                return;
            }

            return guess(word);
        });
    };

    winp.onkeyup = ev => {
        winp.value = winp.value.replace(/[^A-Za-z\/]/g, "").toLowerCase();
    };
})();
