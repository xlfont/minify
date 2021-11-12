require! <[fs fs-extra path yargs @plotdb/opentype.js]>

# dump all opentype.js fields of a loaded font into separated files.
# useful for font debugging and analyzing

argv = yargs
  .option \fontfile, do
    alias: \f
    description: "font file"
    type: \string
  .option \out, do
    alias: \o
    description: "output folder"
    type: \string
  .help \help
  .alias \help, \h
  .check (argv, options) ->
    if !argv.f => throw new Error("font file is required")
    if !argv.o => throw new Error("output folder is required")
    return true
  .argv

file = argv.f
fs-extra.ensure-dir-sync argv.o

opentype.load file .then (font) ->
  fs.write-file-sync path.join(argv.o, "glyphs.json"), JSON.stringify(font.glyphs.glyphs, null, '  ')
  for k,v of font =>
    console.log "output: ", k
    if typeof(v) == \function => continue
    try
      fs.write-file-sync path.join(argv.o, "#k.json"), JSON.stringify(v, null, '  ')
    catch e
      console.log e
