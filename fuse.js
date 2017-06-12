const { FuseBox, WebIndexPlugin, SassPlugin, CSSPlugin, RawPlugin, CopyPlugin, CSSResourcePlugin } = require("fuse-box");

const fuse = FuseBox.init({
    homeDir: "src",
    output: "dist/$name.js",
    plugins: [
        ['.scss',
            SassPlugin(),
         CSSPlugin({group: "app.css", outFile: "./dist/app.css"})],
        WebIndexPlugin({template: "src/index.html", path: 'dist/'}),
        ],
    log: true,
    debug: true
});

fuse.dev({
    port: 4444
})

// if (!production) { app.hmr().watch() }

fuse.bundle("app")
    .sourceMaps(true)
    .instructions(`>index.ts
                   + **/*.scss
                   + **/*.css`)
    .hmr()
    .watch();

fuse.run();