/* ============================================================
   MINI XLSX WRITER

   Builds a real multi-sheet .xlsx in the browser with no dependencies.

   A CSV would have been a line of code, but it is one flat table, and the
   backup wanted here is four related ones — the pool, the money per
   category, the teams and their squads. Renaming a CSV to .xls also makes
   Excel warn that the contents do not match the extension every time it is
   opened, which is not what you want a backup to do.

   So: a stored (uncompressed) ZIP holding the handful of XML parts Excel
   needs. Strings are written inline, which skips the shared-string table
   and the styles part entirely.
   ============================================================ */

(function (global) {
  "use strict";

  /* ---- CRC32, needed by the ZIP central directory ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();

  /* ---- ZIP (store only) ------------------------------------ */
  function zip(files) {
    var chunks = [], central = [], offset = 0;

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = enc.encode(f.data);
      var crc = crc32(data);

      var local = new Uint8Array(30 + name.length);
      var dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);   // local file header
      dv.setUint16(4, 20, true);           // version needed
      dv.setUint16(6, 0x0800, true);       // UTF-8 filename flag
      dv.setUint16(8, 0, true);            // stored
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true);
      local.set(name, 30);

      chunks.push(local, data);

      var cd = new Uint8Array(46 + name.length);
      var cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);   // central directory header
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      cd.set(name, 46);
      central.push(cd);

      offset += local.length + data.length;
    });

    var cdSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);     // end of central directory
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(chunks.concat(central, [end]),
                    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---- XML helpers ----------------------------------------- */
  function xml(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      /* control characters are illegal in XML 1.0 and would make Excel
         refuse the whole file */
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  }

  function colName(i) {
    var s = "";
    i += 1;
    while (i > 0) {
      var r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /* Excel rejects these characters in a sheet name, caps it at 31, and
     refuses a workbook whose sheets share a name. */
  function sheetNames(sheets) {
    var used = {}, out = [];
    sheets.forEach(function (s, i) {
      var n = String((s && s.name) || ("Sheet" + (i + 1)))
                .replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || ("Sheet" + (i + 1));
      var base = n, k = 2;
      while (used[n.toLowerCase()]) {
        var suffix = " " + k++;
        n = base.slice(0, 31 - suffix.length) + suffix;
      }
      used[n.toLowerCase()] = true;
      out.push(n);
    });
    return out;
  }

  function sheetXml(rows) {
    var out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    rows.forEach(function (row, r) {
      out += '<row r="' + (r + 1) + '">';
      (row || []).forEach(function (cell, c) {
        if (cell === null || cell === undefined || cell === "") return;
        var ref = colName(c) + (r + 1);
        if (typeof cell === "number" && isFinite(cell)) {
          out += '<c r="' + ref + '"><v>' + cell + "</v></c>";
        } else {
          out += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
                 xml(cell) + "</t></is></c>";
        }
      });
      out += "</row>";
    });
    return out + "</sheetData></worksheet>";
  }

  /* sheets: [{ name, rows: [[cell, ...], ...] }] */
  function build(sheets) {
    var names = sheetNames(sheets);
    var files = [
      { name: "[Content_Types].xml", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
                 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join("") + "</Types>" },

      { name: "_rels/.rels", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>" },

      { name: "xl/workbook.xml", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map(function (n, i) {
          return '<sheet name="' + xml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join("") + "</sheets></workbook>" },

      { name: "xl/_rels/workbook.xml.rels", data:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) + '" ' +
                 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
                 'Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join("") + "</Relationships>" }
    ];

    sheets.forEach(function (s, i) {
      files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: sheetXml(s.rows || []) });
    });

    return zip(files);
  }

  global.MiniXlsx = { build: build };
})(window);
