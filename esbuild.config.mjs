import esbuild from "esbuild";
const prod = process.argv[2] === "--production";
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // CM6 liefert Obsidian zur Laufzeit; gebündelt entstünde eine zweite Instanz (REGISTRY, neurovim).
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "node:*"],
  format: "cjs",
  target: "es2022",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  outfile: "main.js",
});
if (prod) { await ctx.rebuild(); await ctx.dispose(); } else { await ctx.watch(); }
