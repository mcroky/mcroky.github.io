(() => {
  "use strict";

  const ink = "#18392e";
  const lime = "#d9ef96";
  const cream = "#fffdf6";
  const paper = "#ecece0";
  const orange = "#df6939";
  const fontStack = 'system-ui, "Segoe UI", "Apple SD Gothic Neo", "Malgun Gothic", "Hiragino Sans", "Microsoft YaHei", sans-serif';

  function text(ctx, value, x, y, width, size, weight, color, align = "left") {
    ctx.font = weight + " " + size + "px " + fontStack;
    const measured = ctx.measureText(value).width;
    if (measured > width) {
      ctx.font = weight + " " + Math.floor(size * width / measured) + "px " + fontStack;
    }
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function circle(ctx, x, y, radius, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawClock(ctx, minutes) {
    ctx.save();
    ctx.translate(979, 266);
    circle(ctx, 0, 0, 102, "#284e3f");
    for (let mark = 0; mark < 12; mark++) {
      ctx.save();
      ctx.rotate(mark * Math.PI / 6);
      line(ctx, 0, -83, 0, mark % 3 === 0 ? -69 : -77, "#a5bba3", 3);
      ctx.restore();
    }
    ctx.lineCap = "round";
    function hand(angle, length, color, width) {
      line(ctx, 0, 0, length * Math.sin(angle), -length * Math.cos(angle), color, width);
    }
    hand(minutes * Math.PI / 360, 44, cream, 8);
    hand(minutes * Math.PI / 30, 67, lime, 6);
    circle(ctx, 0, 0, 7, orange);
    ctx.restore();
  }

  function drawMark(ctx) {
    ctx.save();
    ctx.translate(87, 74);
    ctx.fillStyle = orange;
    ctx.beginPath();
    ctx.roundRect(0, 0, 54, 54, 14);
    ctx.fill();
    ctx.strokeStyle = cream;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(27, 28, 14, 0, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(27, 20);
    ctx.lineTo(27, 29);
    ctx.lineTo(39, 16);
    ctx.moveTo(32, 16);
    ctx.lineTo(39, 16);
    ctx.lineTo(39, 23);
    ctx.stroke();
    ctx.restore();
  }

  function drawTicket({ copy, locale, plan, dateLabel, rows }) {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    canvas.lang = locale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 1200, 900);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(42, 38, 1116, 824, 36);
    ctx.clip();
    ctx.fillStyle = cream;
    ctx.fillRect(42, 38, 1116, 824);
    ctx.fillStyle = ink;
    ctx.fillRect(42, 38, 1116, 388);

    drawMark(ctx);
    text(ctx, copy.appName, 156, 112, 385, 33, 750, cream);
    text(ctx, copy.date, 1108, 86, 490, 21, 550, "#b6c7ad", "right");
    text(ctx, dateLabel, 1108, 124, 490, 31, 650, cream, "right");
    line(ctx, 89, 151, 1111, 151, "#3f5d4f", 2);

    const departure = rows[1];
    text(ctx, copy.leave, 91, 216, 410, 31, 600, lime);
    text(ctx, departure.time, 83, 360, 650, 146, 750, cream);
    if (departure.offset) {
      ctx.font = "650 24px " + fontStack;
      const badgeWidth = Math.min(620, Math.ceil(ctx.measureText(departure.offset).width) + 32);
      ctx.fillStyle = lime;
      ctx.beginPath();
      ctx.roundRect(90, 372, badgeWidth, 40, 20);
      ctx.fill();
      text(ctx, departure.offset, 106, 400, badgeWidth - 32, 24, 650, ink);
    }
    drawClock(ctx, plan.leave);
    ctx.setLineDash([6, 9]);
    line(ctx, 55, 426, 1145, 426, "#899882", 2);
    ctx.setLineDash([]);
    circle(ctx, 42, 426, 16, paper);
    circle(ctx, 1158, 426, 16, paper);

    text(ctx, copy.timeline, 90, 500, 606, 37, 750, ink);
    const gap = locale === "en" ? " " : "";
    const duration = Intl.NumberFormat(locale).format(plan.total) + gap + copy.minutes;
    text(ctx, copy.total + "  " + duration, 1107, 497, 350, 26, 600, "#496451", "right");
    line(ctx, 100, 554, 100, 782, "#c7cebe", 3);
    rows.forEach((row, index) => {
      const y = 554 + index * 76;
      const isDeparture = index === 1;
      circle(ctx, 100, y, isDeparture ? 10 : 7, isDeparture ? orange : "#557363");
      text(ctx, row.label, 130, y + 11, 455, 31, isDeparture ? 750 : 550, ink);
      if (row.offset) text(ctx, row.offset, 908, y + 9, 290, 24, 550, "#526a57", "right");
      text(ctx, row.time, 1108, y + 13, 175, 39, 700, ink, "right");
      if (index < rows.length - 1) line(ctx, 130, y + 39, 1108, y + 39, "#e2e5d9", 1);
    });
    ctx.restore();
    return canvas;
  }

  async function download(options) {
    const canvas = drawTicket(options);
    const anchor = document.createElement("a");
    anchor.download = options.filename;
    let objectUrl;
    if (canvas.toBlob && typeof URL.createObjectURL === "function") {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error("PNG encoding failed")), "image/png");
      });
      objectUrl = URL.createObjectURL(blob);
      anchor.href = objectUrl;
    } else {
      anchor.href = canvas.toDataURL("image/png");
    }
    try {
      document.body.append(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  }

  globalThis.NagalTicket = { download };
})();
