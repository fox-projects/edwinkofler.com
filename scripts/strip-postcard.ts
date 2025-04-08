#!/usr/bin/env -S deno --allow-read --allow-write
const text = await Deno.readTextFile("./build/index.html");
console.log(text);
const newText = text.replace(
  /<div class="postcard-layout.*?<\/main>/s,
  "</div>\n</main>",
);
await Deno.writeTextFile("./build/index.html", newText);
