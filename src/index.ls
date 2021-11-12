require! <[fs fs-extra path yargs uglifycss @plotdb/opentype.js ttf2woff2 colors]>

lib = path.dirname fs.realpathSync __filename

argv = yargs
  .option \input, do
    alias: \i
    description: "input directory"
    type: \string
  .option \output, do
    alias: \o
    description: "output directory"
    type: \string
  .option \config, do
    alias: \c
    description: "config file"
    type: \string
  .help \help
  .alias \help, \h
  .check (argv, options) ->
    if !argv.i => throw new Error("input is required")
    return true
  .argv

srcdir  = argv.i or 'in'
desdir  = argv.o or 'out'
cfgfile = argv.c or path.join(srcdir, 'config.json')

try
  cfg = JSON.parse(fs.read-file-sync cfgfile .toString!)
catch e
  cfg = {}

weight-map = {
  "thin": 100, "hairline": 100,
  "extralight": 200, "ultralight": 200,
  "light": 300,
  "regular": 400,
  "medium": 500,
  "semibold": 600, "demibold": 600,
  "bold": 700,
  "extrabold": 800, "ultrabold": 800,
  "black": 900, "heavy": 900,
  "extrablack": 950, "ultrablack": 950
}

KB = -> (Math.round(it / 1024) + "KB").padStart(4,' ')

glyph-index =
  picked: (v, c) ->
    if c and Array.isArray(c) =>
      return c.filter(-> v == it or (v >= it.0 and v <= it.1)).length
    else return v >= 32 and v < 128
  normalize-cfg: (c) ->
    if !c => c = [32, 127]
    if c.length == 2 and !Array.isArray(c.0) and !Array.isArray(c.1) => c = [c]
    return c

  by-range: (font, c) ->
    ret = []
    c = @normalize-cfg c
    for i from 0 til font.glyphs.length =>
      g = font.glyphs.glyphs[i]
      if c.filter((r)-> g.unicode == r or (g.unicode >= r.0 and g.unicode <= r.1)).length => ret.push g.index
    return ret

  from-gsub: (font, c) ->
    c = @normalize-cfg c
    glyphs = font.glyphs.glyphs
    ligGlyph = new Set!
    for lookup in font.tables.gsub.lookups
      for subtable in lookup.subtables
        # only support ligature for now
        if !subtable.ligatureSets => continue
        # only if we need any glyphs in subtable.coverage.glyphs
        any-glyphs = (subtable.coverage.glyphs or [])
          .filter(~> glyphs[it] and @picked glyphs[it].unicode, c).length
        if !any-glyphs => continue
        for ligs in subtable.ligatureSets
          for lig in ligs =>
            # only if we need all glyphs in lig.components
            if lig.components.filter(~> !(glyphs[it] and @picked glyphs[it].unicode, c)).length => continue
            # then we will need glyphs in this position: list = ligs.map -> it.ligGlyph
            ligGlyph.add lig.ligGlyph
    return Array.from(ligGlyph)

  all: (font, c) ->
    c = @normalize-cfg c
    glyphs = font.glyphs.glyphs
    picked-glyphs = new Set!
    glyph-index.by-range(font, c).map -> picked-glyphs.add it
    glyph-index.from-gsub(font, c).map -> picked-glyphs.add it
    picked-glyph-index-list = Array.from(picked-glyphs)
    picked-glyph-index-list.sort (a,b) ->
      [ta, tb] = [a? b?]
      return if !a? and !b? => 0
      else if !b? => -1
      else if !a? => 1
      else a - b
    picked-glyphs = picked-glyph-index-list.map -> glyphs[it]
    return picked-glyphs

minify = (file) ->
  opentype.load file .then (font) ->
    ns = font.names
    console.log "Processing #file ...".cyan
    glyphs = []
    for k,g of font.glyphs.glyphs =>
      glyphs.push g
      if !g.name => g.name = ''
    c = cfg[path.basename(file)] or null
    glyphs = glyph-index.all(font, c)

    console.log "  reduce glyphs: #{font.glyphs.length} -> #{glyphs.length}"

    size = fs.stat-sync file .size
    nf = new opentype.Font({glyphs: glyphs} <<< {
      familyName: ns.fontFamily.en
      styleName: (ns.fontSubfamily or ns.fontsubFamily or {}).en or ''
    } <<< font{unitsPerEm, ascender, descender})
    buf = (Buffer.from(nf.toArrayBuffer!))
    wbuf = ttf2woff2(buf)
    b64 = wbuf.toString \base64
    datauri = "data:font/woff2;base64,#b64"
    console.log(
      "  (#{KB size}) > reduced(#{KB buf.length}) > woff2(#{KB wbuf.length}) > inline(#{KB datauri.length})",
      "#{KB (size - datauri.length)} saved (#{Math.round(100 * (size - datauri.length) / size)}%)".yellow
    )
    console.log!

    name = (ns.preferredFamily or ns.fontFamily or {}).en or 'unnamed'

    subfamily = ((
      ns.preferredSubfamily or
      ns.preferredsubFamily or
      ns.fontSubfamily or ns.fontsubFamily or {}
    ).en or '')
      .split(/ +/).map(->it.trim!).filter(->it)

    if weight-map[sub = name.split(' ')[* - 1].toLowerCase!] =>
      subfamily = [sub] ++ subfamily
      name = name.split(' ')
      name.splice(name.length - 1, 1)
      name = name.join(' ')

    style = subfamily
      .map -> (it or '').toLowerCase! 
      .filter -> it in <[normal italic]>
      .0 or \normal
      
    weight = subfamily
      .map -> weight-map[(it or '').toLowerCase!]
      .filter -> it
      .0 or 400

    css = """
    @font-face {
      font-family: '#name';
      font-style: #style;
      font-weight: #weight;
      font-display: optional;
      src: url('#datauri') format('woff2');
    }
    """
    return css

process-files = (files) ->
  files = files.filter -> /\.ttf$/.exec(it)
  raw-size = files.reduce(((a,b) -> a + fs.stat-sync(b).size), 0)
  Promise.all files.map(-> minify it)
    .then (css-list) ->
      css = css-list.join \\n
      css-min = uglifycss.process-string css
      fs-extra.ensure-dir-sync desdir
      fs.write-file-sync path.join(desdir, "mini-fonts.css"), css
      fs.write-file-sync path.join(desdir, "mini-fonts.min.css"), css-min
      console.log " >> output css file size: "
      console.log "    mini-fonts.css:     #{(css.length / 1024).toFixed(2)}KB".green
      console.log "    mini-fonts.min.css: #{(css-min.length / 1024).toFixed(2)}KB".green
      console.log "    raw size: #{KB raw-size} -> min size: #{(css-min.length / 1024).toFixed(2)}KB"
      console.log "    #{(100 * (raw-size - css-min.length) / raw-size).toFixed 1}% reduced.".yellow
      console.log!

fs-extra.ensure-dir-sync desdir
process-files fs.readdir-sync(srcdir).map(-> path.join(srcdir, it))
  .then ->
    console.log \done.
    process.exit!
