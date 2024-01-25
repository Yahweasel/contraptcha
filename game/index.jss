<!doctype html>
<!--
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
-->
<?JS
const fs = require("fs");
let seed = -1, img = null;
if (request.query && request.query.s)
    seed = +request.query.s;
if (seed >= 0) {
    try {
        img = `/assets/${seed}/0_3f.webp`;
        fs.accessSync(`/var/www/html${img}`, fs.constants.R_OK);
    } catch (ex) {
        seed = -1;
        img = null;
    }
}
?>
<html prefix="og: https://ogp.me/ns#">
    <head>
        <meta charset="utf8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Contraptcha</title>
        <link rel="stylesheet" href="contraptcha.css?v=n" />

        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
        <link rel="mask-icon" href="/favicon/safari-pinned-tab.svg" color="#5bbad5" />
        <meta name="msapplication-TileColor" content="#da532c" />
        <meta name="theme-color" content="#ffffff" />

        <meta property="og:title" content="Contraptcha" />
        <meta property="og:type" content="website" />
        <meta property="og:description" content="A word puzzle game inspired by AI-generated art and CAPTCHAs." />
        <meta property="og:url" content="https://contraptcha.com/<?JS= (seed >= 0) ? `?s=${seed}` : "" ?>" />
        <meta property="og:image" content="https://contraptcha.com<?JS= img || "/assets/img/limeduck-bg.webp" ?>" />
        <meta property="og:image:type" content="image/webp" />
        <meta property="og:image:alt" content="An AI-generated puzzle image" />
    </head>
    <body>
        <div id="main" style="display: none;">
            <div id="maingame">
                <div>
                    <div class="imgrow row">
                        <div class="imgbox" id="img1"></div>
                        <div class="imgbox" id="img2"></div>
                    </div>
                    <div class="imgrow row">
                        <div class="imgbox" id="img3"></div>
                        <div class="imgbox" id="img4"></div>
                    </div>
                </div>
                <div class="wordguessrow row">
                    <div class="wordguesshalfrow">
                        <div class="wordguess" id="wg1"></div>
                        <div class="wordguess" id="wg2"></div>
                        <div class="wordguess" id="wg3"></div>
                    </div>
                    <div class="wordguesshalfrow">
                        <div class="wordguess" id="wg4"></div>
                        <div class="wordguess" id="wg5"></div>
                        <div class="wordguess" id="wg6"></div>
                    </div>
                </div>
                <div class="inputrow row">
                    <input type="text" id="wordinput" />
                    <div id="scoredisplay"></div>
                </div>
            </div>
            <div class="btnrow row">
                <button id="menubtn" class="mainbtn">Game</button>
                <button id="hintbtn" class="mainbtn">Hint</button>
                <button id="helpbtn" class="mainbtn">Help</button>
                <button id="creditsbtn" class="mainbtn">Credits</button>
            </div>
        </div>

        <div id="panelguard"></div>

        <div id="panelbox1">
            <div id="panelbox2">
                <div id="panelbox3">
                    <div id="loadingpanel" class="panel">
                        <h2>Loading...</h2>
                    </div>
                </div>
            </div>
        </div>

        <div style="display: none;">
            <div id="helppanel" class="panel">
                <button class="close">x</button>

                <h2>What is this???</h2>

                <p>This is Contraptcha, the word and art game no one asked for!</p>

                <p>
                    (WARNING: These images are AI generated. Some may be racist,
                    erotic, troubling, or anything else.)
                </p>

                <p>
                    Contraptcha is a word puzzle inspired by AI-generated art
                    and CAPTCHAs. In this game, you're presented with four
                    images, each drawn by AI from the same prompt. The prompt is
                    simply a sequence of English nouns. Every time you find one
                    of the words, that's removed from the prompt, so you see the
                    images generated with one word less. Your goal is, of
                    course, to find every word.
                </p>

                <p>
                    Remember: AI is stupid and bad at everything, so you may
                    have to think outside the box.
                </p>

                <p>
                    If you enter a word that's not part of the prompt, a
                    “semantic similarity” will be shown for whichever word it's
                    most similar to. For instance, if the word is “space” and
                    you enter “stars”, you'll get a high semantic similarity,
                    whereas if the word is “pig” and you enter “stars”, you'll
                    get a low semantic similarity.
                </p>

                <p>
                    You can “peek” through any word, showing how the images
                    would be generated without any one of the words you don't
                    know. Click the word's guess box (the question marks), or
                    enter a number from 1–6. What you're doing is
                    <em>removing</em> a word, so if you remove word 4 and the
                    stars disappear from the image, that means word 4 probably
                    <em>is</em> star or stars!
                </p>

                <p>
                    If you're stumped, you can let the game guess a random word
                    for you by clicking the “hint” button or typing “/hint”.
                    But, your score will be penalized!
                </p>

                <p>
                    You start with 100 points and lose them when you make
                    incorrect guesses. The closer the guess is to correct, the
                    fewer points you lose (you can lose 0 if it's very close!).
                    When you use a hint, you lose three times the tens place of
                    the hint's similarity in points. Oh, and your points can go
                    negative! If you restart a game, you do get to restart from
                    100 points, but your score will be shown with an asterisk.
                </p>

                <p>
                    There's a puzzle of the day every day, and lots of other
                    (not “of-the-day”) puzzles to play too!
                </p>
            </div>

            <div id="creditspanel" class="panel">
                <button class="close">x</button>

                <h2>Credits</h2>

                <p>Contraptcha is <a href="https://github.com/Yahweasel/contraptcha">open source</a> and was written by <a href="https://github.com/Yahweasel">Yahweasel</a>. If you have an ideas or improvements, by all means, contact Yahweasel!</p>

                <p>Images generated for Contraptcha use <a href="https://stability.ai/stable-image">Stable Diffusion XL</a>. The models used are <a href="https://civitai.com/models/133005/juggernaut-xl">Juggernaut XL</a>, <a href="https://civitai.com/models/139562/realvisxl-v30-turbo">RealVisXL</a>, <a href="https://civitai.com/models/112902/dreamshaper-xl">DreamShaper XL</a>, and original SDXL.</a></p>

                <p>Text removed from images with <a href="https://github.com/JaidedAI/EasyOCR">EasyOCR</a>.</p>

                <p>Semantic difference is calculated by <a href="https://code.google.com/archive/p/word2vec/">word2vec</a>.</p>

                <p>Thanks to Wordle and Semantle for inspiration.</p>
            </div>

            <div id="menupanel" class="panel">
                <button class="close">x</button>
                <button id="restartbtn" class="mainbtn menubtn">Restart puzzle</button>
                <button id="dailybtn" class="mainbtn menubtn">Daily puzzle</button>
                <button id="newbtn" class="mainbtn menubtn">Random puzzle</button>
                <button id="statsbtn" class="mainbtn menubtn">Stats</button>
                <button id="giveupbtn" class="mainbtn menubtn">Give up</button>
            </div>

            <div id="messagepanel" class="panel">
                <button class="close">x</button>
                <p id="messagepanelmessage"></p>
            </div>

            <div id="statspanel" class="panel">
                <button class="close">x</button>
                <div id="statspanelinner"></div>
            </div>
        </div>

        <div id="imgpanel" style="display: none;">
            <img id="imgpanelimg" />
        </div>

        <script src="https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/text-metrics@4.0.1/dist/text-metrics.js"></script>
        <script type="text/javascript" src="contraptcha.js?v=15"></script>
    </body>
</html>