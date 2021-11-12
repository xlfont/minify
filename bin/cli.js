#!/usr/bin/env node
(function(){
  var fs, fsExtra, path, yargs, uglifycss, opentype, ttf2woff2, colors, lib, argv, srcdir, desdir, cfgfile, cfg, e, weightMap, KB, glyphIndex, minify, processFiles;
  fs = require('fs');
  fsExtra = require('fs-extra');
  path = require('path');
  yargs = require('yargs');
  uglifycss = require('uglifycss');
  opentype = require('@plotdb/opentype.js');
  ttf2woff2 = require('ttf2woff2');
  colors = require('colors');
  lib = path.dirname(fs.realpathSync(__filename));
  argv = yargs.option('input', {
    alias: 'i',
    description: "input directory",
    type: 'string'
  }).option('output', {
    alias: 'o',
    description: "output directory",
    type: 'string'
  }).option('config', {
    alias: 'c',
    description: "config file",
    type: 'string'
  }).help('help').alias('help', 'h').check(function(argv, options){
    if (!argv.i) {
      throw new Error("input is required");
    }
    return true;
  }).argv;
  srcdir = argv.i || 'in';
  desdir = argv.o || 'out';
  cfgfile = argv.c || path.join(srcdir, 'config.json');
  try {
    cfg = JSON.parse(fs.readFileSync(cfgfile).toString());
  } catch (e$) {
    e = e$;
    cfg = {};
  }
  weightMap = {
    "thin": 100,
    "hairline": 100,
    "extralight": 200,
    "ultralight": 200,
    "light": 300,
    "regular": 400,
    "medium": 500,
    "semibold": 600,
    "demibold": 600,
    "bold": 700,
    "extrabold": 800,
    "ultrabold": 800,
    "black": 900,
    "heavy": 900,
    "extrablack": 950,
    "ultrablack": 950
  };
  KB = function(it){
    return (Math.round(it / 1024) + "KB").padStart(4, ' ');
  };
  glyphIndex = {
    picked: function(v, c){
      if (c && Array.isArray(c)) {
        return c.filter(function(it){
          return v === it || (v >= it[0] && v <= it[1]);
        }).length;
      } else {
        return v >= 32 && v < 128;
      }
    },
    normalizeCfg: function(c){
      if (!c) {
        c = [32, 127];
      }
      if (c.length === 2 && !Array.isArray(c[0]) && !Array.isArray(c[1])) {
        c = [c];
      }
      return c;
    },
    byRange: function(font, c){
      var ret, i$, to$, i, g;
      ret = [];
      c = this.normalizeCfg(c);
      for (i$ = 0, to$ = font.glyphs.length; i$ < to$; ++i$) {
        i = i$;
        g = font.glyphs.glyphs[i];
        if (c.filter(fn$).length) {
          ret.push(g.index);
        }
      }
      return ret;
      function fn$(r){
        return g.unicode === r || (g.unicode >= r[0] && g.unicode <= r[1]);
      }
    },
    fromGsub: function(font, c){
      var glyphs, ligGlyph, i$, ref$, len$, lookup, j$, ref1$, len1$, subtable, anyGlyphs, k$, ref2$, len2$, ligs, l$, len3$, lig, this$ = this;
      c = this.normalizeCfg(c);
      glyphs = font.glyphs.glyphs;
      ligGlyph = new Set();
      for (i$ = 0, len$ = (ref$ = font.tables.gsub.lookups).length; i$ < len$; ++i$) {
        lookup = ref$[i$];
        for (j$ = 0, len1$ = (ref1$ = lookup.subtables).length; j$ < len1$; ++j$) {
          subtable = ref1$[j$];
          if (!subtable.ligatureSets) {
            continue;
          }
          anyGlyphs = (subtable.coverage.glyphs || []).filter(fn$).length;
          if (!anyGlyphs) {
            continue;
          }
          for (k$ = 0, len2$ = (ref2$ = subtable.ligatureSets).length; k$ < len2$; ++k$) {
            ligs = ref2$[k$];
            for (l$ = 0, len3$ = ligs.length; l$ < len3$; ++l$) {
              lig = ligs[l$];
              if (lig.components.filter(fn1$).length) {
                continue;
              }
              ligGlyph.add(lig.ligGlyph);
            }
          }
        }
      }
      return Array.from(ligGlyph);
      function fn$(it){
        return glyphs[it] && this$.picked(glyphs[it].unicode, c);
      }
      function fn1$(it){
        return !(glyphs[it] && this$.picked(glyphs[it].unicode, c));
      }
    },
    all: function(font, c){
      var glyphs, pickedGlyphs, pickedGlyphIndexList;
      c = this.normalizeCfg(c);
      glyphs = font.glyphs.glyphs;
      pickedGlyphs = new Set();
      glyphIndex.byRange(font, c).map(function(it){
        return pickedGlyphs.add(it);
      });
      glyphIndex.fromGsub(font, c).map(function(it){
        return pickedGlyphs.add(it);
      });
      pickedGlyphIndexList = Array.from(pickedGlyphs);
      pickedGlyphIndexList.sort(function(a, b){
        var ref$, ta, tb;
        ref$ = [typeof a == 'function' ? a(b != null) : void 8], ta = ref$[0], tb = ref$[1];
        return a == null && b == null
          ? 0
          : b == null
            ? -1
            : a == null
              ? 1
              : a - b;
      });
      pickedGlyphs = pickedGlyphIndexList.map(function(it){
        return glyphs[it];
      });
      return pickedGlyphs;
    }
  };
  minify = function(file){
    return opentype.load(file).then(function(font){
      var ns, glyphs, k, ref$, g, c, size, nf, buf, wbuf, b64, datauri, name, subfamily, sub, style, weight, css;
      ns = font.names;
      console.log(("Processing " + file + " ...").cyan);
      glyphs = [];
      for (k in ref$ = font.glyphs.glyphs) {
        g = ref$[k];
        glyphs.push(g);
        if (!g.name) {
          g.name = '';
        }
      }
      c = cfg[path.basename(file)] || null;
      glyphs = glyphIndex.all(font, c);
      console.log("  reduce glyphs: " + font.glyphs.length + " -> " + glyphs.length);
      size = fs.statSync(file).size;
      nf = new opentype.Font((ref$ = {
        glyphs: glyphs,
        familyName: ns.fontFamily.en,
        styleName: (ns.fontSubfamily || ns.fontsubFamily || {}).en || ''
      }, ref$.unitsPerEm = font.unitsPerEm, ref$.ascender = font.ascender, ref$.descender = font.descender, ref$));
      buf = Buffer.from(nf.toArrayBuffer());
      wbuf = ttf2woff2(buf);
      b64 = wbuf.toString('base64');
      datauri = "data:font/woff2;base64," + b64;
      console.log("  (" + KB(size) + ") > reduced(" + KB(buf.length) + ") > woff2(" + KB(wbuf.length) + ") > inline(" + KB(datauri.length) + ")", (KB(size - datauri.length) + " saved (" + Math.round(100 * (size - datauri.length) / size) + "%)").yellow);
      console.log();
      name = (ns.preferredFamily || ns.fontFamily || {}).en || 'unnamed';
      subfamily = ((ns.preferredSubfamily || ns.preferredsubFamily || ns.fontSubfamily || ns.fontsubFamily || {}).en || '').split(/ +/).map(function(it){
        return it.trim();
      }).filter(function(it){
        return it;
      });
      if (weightMap[sub = (ref$ = name.split(' '))[ref$.length - 1].toLowerCase()]) {
        subfamily = [sub].concat(subfamily);
        name = name.split(' ');
        name.splice(name.length - 1, 1);
        name = name.join(' ');
      }
      style = subfamily.map(function(it){
        return (it || '').toLowerCase();
      }).filter(function(it){
        return it === 'normal' || it === 'italic';
      })[0] || 'normal';
      weight = subfamily.map(function(it){
        return weightMap[(it || '').toLowerCase()];
      }).filter(function(it){
        return it;
      })[0] || 400;
      css = "@font-face {\n  font-family: '" + name + "';\n  font-style: " + style + ";\n  font-weight: " + weight + ";\n  font-display: optional;\n  src: url('" + datauri + "') format('woff2');\n}";
      return css;
    });
  };
  processFiles = function(files){
    var rawSize;
    files = files.filter(function(it){
      return /\.ttf$/.exec(it);
    });
    rawSize = files.reduce(function(a, b){
      return a + fs.statSync(b).size;
    }, 0);
    return Promise.all(files.map(function(it){
      return minify(it);
    })).then(function(cssList){
      var css, cssMin;
      css = cssList.join('\n');
      cssMin = uglifycss.processString(css);
      fsExtra.ensureDirSync(desdir);
      fs.writeFileSync(path.join(desdir, "mini-fonts.css"), css);
      fs.writeFileSync(path.join(desdir, "mini-fonts.min.css"), cssMin);
      console.log(" >> output css file size: ");
      console.log(("    mini-fonts.css:     " + (css.length / 1024).toFixed(2) + "KB").green);
      console.log(("    mini-fonts.min.css: " + (cssMin.length / 1024).toFixed(2) + "KB").green);
      console.log("    raw size: " + KB(rawSize) + " -> min size: " + (cssMin.length / 1024).toFixed(2) + "KB");
      console.log(("    " + (100 * (rawSize - cssMin.length) / rawSize).toFixed(1) + "% reduced.").yellow);
      return console.log();
    });
  };
  fsExtra.ensureDirSync(desdir);
  processFiles(fs.readdirSync(srcdir).map(function(it){
    return path.join(srcdir, it);
  })).then(function(){
    console.log('done.');
    return process.exit();
  });
}).call(this);
