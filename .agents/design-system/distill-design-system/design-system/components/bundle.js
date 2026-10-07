/* @ds-bundle: {"format":4,"namespace":"Distill","components":[{"name":"Button"},{"name":"Tab"},{"name":"TextField"},{"name":"Dropzone"},{"name":"Thumbnail"},{"name":"Alert"},{"name":"Badge"},{"name":"Chip"},{"name":"Swatch"},{"name":"MetaItem"},{"name":"SectionTitle"},{"name":"MoodList"},{"name":"CodeBlock"},{"name":"TokenSample"}]} */
(function () {
  "use strict";
  var R = window.React;
  var h = R.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }
  function omit(p, keys) { var o = {}; for (var k in p) if (keys.indexOf(k) < 0) o[k] = p[k]; return o; }

  function Button(p) {
    var variant = p.variant || "primary", size = p.size || "md";
    return h("button", Object.assign({ type: "button" }, omit(p, ["variant", "size", "className"]), {
      className: cx("dt-btn", "dt-btn-" + variant, size === "sm" && "dt-btn-sm", p.className)
    }));
  }

  function Tab(p) {
    return h("button", Object.assign({ type: "button", role: "tab" }, omit(p, ["active", "className"]), {
      "aria-selected": p.active ? "true" : "false",
      className: cx("dt-tab", p.className)
    }));
  }

  function TextField(p) {
    return h("input", Object.assign({ type: "url" }, omit(p, ["className"]), { className: cx("dt-input", p.className) }));
  }

  function Dropzone(p) {
    var count = p.count || 0, id = p.id || "dt-image-input";
    var label = count > 0
      ? h("span", null, count + " image" + (count > 1 ? "s" : "") + " selected — ", h("u", null, "add more"))
      : h("span", null, "Drag & drop image(s) here, or ", h("u", null, "browse"));
    return h("div", {
      className: cx("dt-drop", p.className),
      onDragOver: function (e) { e.preventDefault(); },
      onDrop: function (e) { e.preventDefault(); if (p.onFiles && e.dataTransfer.files && e.dataTransfer.files.length) p.onFiles(Array.prototype.slice.call(e.dataTransfer.files)); }
    },
      h("input", { type: "file", accept: p.accept || "image/*", multiple: true, id: id, style: { display: "none" },
        onChange: function (e) { if (p.onFiles && e.target.files && e.target.files.length) p.onFiles(Array.prototype.slice.call(e.target.files)); e.target.value = ""; } }),
      h("label", { htmlFor: id }, label));
  }

  function Thumbnail(p) {
    return h("div", { className: cx("dt-thumb", p.className) },
      h("img", { src: p.src, alt: p.alt || "" }),
      p.onRemove ? h("button", { type: "button", onClick: p.onRemove, "aria-label": p.removeLabel || "Remove image" }, "×") : null);
  }

  function Alert(p) {
    var tone = p.tone || "danger";
    return h(tone === "danger" ? "div" : "p", { className: cx("dt-alert", "dt-alert-" + tone, p.className), role: tone === "danger" ? "alert" : undefined },
      p.title ? h("strong", null, p.title) : null, p.title ? " " : null, p.children);
  }

  function Badge(p) {
    return h("span", { className: cx("dt-badge", p.variant === "provenance" && "dt-badge-provenance", p.className) }, p.children);
  }

  function Chip(p) {
    var variant = p.variant || "outline";
    var verdict = p.verdict ? h("strong", { className: p.verdict === "fail" ? "dt-fail" : "dt-pass" }, p.verdict) : null;
    return h("span", { className: cx("dt-chip", "dt-chip-" + variant, p.className) }, p.children, verdict ? " " : null, verdict);
  }

  function Swatch(p) {
    return h("div", { className: cx("dt-swatch", p.className) },
      h("div", { className: "dt-swatch-color", style: { backgroundColor: p.hex } }),
      h("div", { className: "dt-swatch-body" },
        h("div", { className: "dt-swatch-head" },
          h("span", { className: "dt-swatch-role" }, p.role),
          p.imageSourced ? h("span", { className: "dt-swatch-img" }, "img") : null),
        h("div", { className: "dt-swatch-hex" }, p.hex),
        p.usage != null ? h("div", { className: "dt-swatch-usage" }, p.usage + (p.areaWeight != null ? " · " + Math.round(p.areaWeight * 100) + "%" : "")) : null));
  }

  function MetaItem(p) {
    return h("div", { className: cx("dt-meta-item", p.className) },
      h("dt", null, p.label),
      h("dd", { title: p.value }, p.value));
  }

  function SectionTitle(p) {
    return h("h2", { className: cx("dt-section-title", p.className) }, p.children,
      p.provenance ? h(Badge, { variant: "provenance" }, p.provenance) : null);
  }

  function MoodList(p) {
    return h("div", { className: p.className },
      h("div", { className: "dt-mood-label" }, p.label),
      h("ul", { className: "dt-mood" }, (p.items || []).map(function (q) { return h("li", { key: q }, q); })));
  }

  function CodeBlock(p) {
    return h("pre", { className: cx("dt-pre", p.className) }, h("code", null, p.children));
  }

  function TokenSample(p) {
    var kind = p.kind || "spacing", v = p.value;
    if (kind === "spacing") {
      var px = typeof v === "number" ? v : parseFloat(v);
      return h("div", { className: "dt-space" }, h("div", { className: "dt-space-bar", style: { width: Math.min(px, 32) + "px" } }), h("span", null, px + "px"));
    }
    if (kind === "radius") return h("div", { className: "dt-radius", style: { borderRadius: v } }, v);
    return h("div", { className: "dt-shadow", style: { boxShadow: v } }, h("b", null, p.name || ""), " ", v);
  }

  window.Distill = Object.assign(window.Distill || {}, {
    Button: Button, Tab: Tab, TextField: TextField, Dropzone: Dropzone, Thumbnail: Thumbnail, Alert: Alert, Badge: Badge,
    Chip: Chip, Swatch: Swatch, MetaItem: MetaItem, SectionTitle: SectionTitle, MoodList: MoodList, CodeBlock: CodeBlock, TokenSample: TokenSample
  });
})();
