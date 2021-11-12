# @xlfont/minify

optimize fonts for web by

 - triming unused characters
 - convert ttf to woff2
 - inline all fonts into a single CSS file


## Usage

    npm install --save @xlfont/minify
    npx xlfminify -i font-folder -o min-css-output-folder

By default only characters from 7bit ascii codes are preserved. alternatively, use `-c config.json` to config this behavior:

    npx xlfminify -i font-folder -o min-css-output-folder -c my-config-file.json

where `my-config-file.json` may be something like:

    {
      "my-font-file-name.ttf": [32, 128],
      "another-font-file.ttf": [32, [48, 57]]
    }

`@xlfont/minify` looks for `<font-folder>/config.json` by default if `-c` is omitted.


## License

MIT
