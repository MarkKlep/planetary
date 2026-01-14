"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setColor = exports.readBinaryFile = exports.app = void 0;
var api_server_1 = require("./api/api-server");
var fs = require("fs");
var express = require("express");
var cors = require("cors");
var _a = require("canvas"), createCanvas = _a.createCanvas, loadImage = _a.loadImage;
exports.app = express();
exports.app.use(cors());
var cachedBinaryData = null;
var cachedHeatmapByPalette = new Map();
var heatmapInFlightByPalette = new Map();
var readBinaryFile = function (filePath) {
    return new Promise(function (resolve, reject) {
        fs.readFile(filePath, function (err, data) {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
};
exports.readBinaryFile = readBinaryFile;
var setColor = function (temp) {
    var celcius = (temp - 32) / 1.8;
    var color;
    if (celcius <= 0) {
        color = "blue";
    }
    else if (celcius > 0 && celcius < 10) {
        color = "lightblue";
    }
    else if (celcius >= 10 && celcius < 20) {
        color = "lime";
    }
    else if (celcius >= 20 && celcius < 30) {
        color = "yellow";
    }
    else if (celcius >= 30 && celcius < 40) {
        color = "orange";
    }
    else {
        color = "red";
    }
    return color;
};
exports.setColor = setColor;
var clamp01 = function (value) { return Math.max(0, Math.min(1, value)); };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var tempFToC = function (tempF) { return (tempF - 32) / 1.8; };
var VIRIDIS_STOPS = [
    { t: 0.0, rgb: [68, 1, 84] },
    { t: 0.1, rgb: [72, 40, 120] },
    { t: 0.2, rgb: [62, 74, 137] },
    { t: 0.35, rgb: [49, 104, 142] },
    { t: 0.5, rgb: [38, 130, 142] },
    { t: 0.65, rgb: [31, 158, 137] },
    { t: 0.78, rgb: [53, 183, 121] },
    { t: 0.88, rgb: [109, 205, 89] },
    { t: 0.95, rgb: [180, 222, 44] },
    { t: 1.0, rgb: [253, 231, 37] },
];
var SPECTRAL_STOPS = [
    { t: 0.0, rgb: [49, 54, 149] },
    { t: 0.2, rgb: [69, 117, 180] },
    { t: 0.4, rgb: [116, 173, 209] },
    { t: 0.55, rgb: [171, 221, 164] },
    { t: 0.7, rgb: [253, 174, 97] },
    { t: 0.85, rgb: [244, 109, 67] },
    { t: 1.0, rgb: [165, 0, 38] },
];
var rampFromStops = function (stops, t) {
    var tt = clamp01(t);
    for (var i = 0; i < stops.length - 1; i++) {
        var a = stops[i];
        var b = stops[i + 1];
        if (tt >= a.t && tt <= b.t) {
            var localT = (tt - a.t) / (b.t - a.t || 1);
            return [
                Math.round(lerp(a.rgb[0], b.rgb[0], localT)),
                Math.round(lerp(a.rgb[1], b.rgb[1], localT)),
                Math.round(lerp(a.rgb[2], b.rgb[2], localT)),
            ];
        }
    }
    return stops[stops.length - 1].rgb;
};
var turboColor = function (t) {
    var x = clamp01(t);
    var r = 34.61 + x * (1172.33 + x * (-10793.56 + x * (33300.12 + x * (-38394.49 + x * 14825.05))));
    var g = 23.31 + x * (557.33 + x * (1225.33 + x * (-3574.96 + x * (1501.88 + x * 0.00))));
    var b = 27.2 + x * (3211.1 + x * (-15327.97 + x * (27814.0 + x * (-22569.18 + x * 6838.66))));
    return [
        Math.round(clamp(r, 0, 255)),
        Math.round(clamp(g, 0, 255)),
        Math.round(clamp(b, 0, 255)),
    ];
};
var paletteColor = function (palette, t) {
    switch (palette) {
        case 'turbo':
            return turboColor(t);
        case 'spectral':
            return rampFromStops(SPECTRAL_STOPS, t);
        case 'viridis':
        default:
            return rampFromStops(VIRIDIS_STOPS, t);
    }
};
var tempToRgbSmooth = function (tempF, palette) {
    var c = tempFToC(tempF);
    var t = (c - -2) / (35 - -2);
    return paletteColor(palette, t);
};
var parsePalette = function (value) {
    if (value === 'turbo' || value === 'spectral' || value === 'viridis')
        return value;
    return 'viridis';
};
var getBinaryData = function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (cachedBinaryData)
                    return [2 /*return*/, cachedBinaryData];
                return [4 /*yield*/, (0, exports.readBinaryFile)(api_server_1.BINARY_FILE_PATH)];
            case 1:
                cachedBinaryData = _a.sent();
                return [2 /*return*/, cachedBinaryData];
        }
    });
}); };
var generateHeatMap = function (binaryData, palette) { return __awaiter(void 0, void 0, void 0, function () {
    var canvas, ctx, image, tempArr, imgData, data, scaleX, scaleY, alpha, baseY, baseX, sum, count, dy, dx, srcY, srcX, v, tempAvgF, y, x, _b, r, g, b, idx, br, bg, bb, buf, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                canvas = createCanvas(api_server_1.EMPTY_IMAGE_WIDTH, api_server_1.EMPTY_IMAGE_HEIGHT);
                ctx = canvas.getContext("2d");
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, loadImage(api_server_1.EMPTY_MAP_IMAGE_PATH)];
            case 2:
                image = _a.sent();
                ctx.drawImage(image, 0, 0, api_server_1.EMPTY_IMAGE_WIDTH, api_server_1.EMPTY_IMAGE_HEIGHT);
                tempArr = new Int8Array(binaryData);
                // The grid is 36,000 x 17,999 (~648M cells). Rendering every cell is far too slow.
                // Downsample to the output resolution (3600 x 1800) by sampling the grid per output pixel.
                imgData = ctx.getImageData(0, 0, api_server_1.EMPTY_IMAGE_WIDTH, api_server_1.EMPTY_IMAGE_HEIGHT);
                data = imgData.data;
                scaleX = api_server_1.DIMENSION_X / api_server_1.EMPTY_IMAGE_WIDTH;
                scaleY = api_server_1.DIMENSION_Y / api_server_1.EMPTY_IMAGE_HEIGHT;
                alpha = 0.65;
                for (y = 0; y < api_server_1.EMPTY_IMAGE_HEIGHT; y++) {
                    baseY = Math.min(api_server_1.DIMENSION_Y - 1, Math.floor((api_server_1.EMPTY_IMAGE_HEIGHT - 1 - y) * scaleY));
                    for (x = 0; x < api_server_1.EMPTY_IMAGE_WIDTH; x++) {
                        baseX = Math.min(api_server_1.DIMENSION_X - 1, Math.floor(x * scaleX));
                        sum = 0;
                        count = 0;
                        for (dy = 0; dy <= 1; dy++) {
                            srcY = baseY + dy;
                            if (srcY >= api_server_1.DIMENSION_Y)
                                continue;
                            for (dx = 0; dx <= 1; dx++) {
                                srcX = baseX + dx;
                                if (srcX >= api_server_1.DIMENSION_X)
                                    continue;
                                v = tempArr[srcY * api_server_1.DIMENSION_X + srcX];
                                if (v === -1)
                                    continue;
                                sum += v;
                                count += 1;
                            }
                        }
                        if (count === 0)
                            continue;
                        tempAvgF = sum / count;
                        _b = tempToRgbSmooth(tempAvgF, palette), r = _b[0], g = _b[1], b = _b[2];
                        idx = (y * api_server_1.EMPTY_IMAGE_WIDTH + x) * 4;
                        br = data[idx];
                        bg = data[idx + 1];
                        bb = data[idx + 2];
                        data[idx] = Math.round(lerp(br, r, alpha));
                        data[idx + 1] = Math.round(lerp(bg, g, alpha));
                        data[idx + 2] = Math.round(lerp(bb, b, alpha));
                        data[idx + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
                buf = canvas.toBuffer("image/jpeg");
                return [2 /*return*/, buf];
            case 3:
                error_1 = _a.sent();
                throw error_1;
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.app.get("/api/data", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var refresh, palette, cacheKey, cached, bufferHeatMap, query, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                query = req.query;
                refresh = (query === null || query === void 0 ? void 0 : query.refresh) === "1";
                palette = parsePalette(query === null || query === void 0 ? void 0 : query.palette);
                cacheKey = palette;
                cached = cachedHeatmapByPalette.get(cacheKey);
                if (!refresh && cached) {
                    res.setHeader("Content-Type", "image/jpeg");
                    res.setHeader("Cache-Control", "no-store");
                    return [2 /*return*/, res.send(cached)];
                }
                if (!heatmapInFlightByPalette.has(cacheKey)) {
                    heatmapInFlightByPalette.set(cacheKey, (function () { return __awaiter(void 0, void 0, void 0, function () {
                        var binaryData, buffer;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, getBinaryData()];
                                case 1:
                                    binaryData = _a.sent();
                                    return [4 /*yield*/, generateHeatMap(binaryData, palette)];
                                case 2:
                                    buffer = _a.sent();
                                    cachedHeatmapByPalette.set(cacheKey, buffer);
                                    return [2 /*return*/, buffer];
                            }
                        });
                    }); })().finally(function () {
                        heatmapInFlightByPalette.delete(cacheKey);
                    }));
                }
                return [4 /*yield*/, heatmapInFlightByPalette.get(cacheKey)];
            case 1:
                bufferHeatMap = _a.sent();
                res.setHeader("Content-Type", "image/jpeg");
                res.setHeader("Cache-Control", "no-store");
                res.send(bufferHeatMap);
                return [3 /*break*/, 4];
            case 3:
                error_2 = _a.sent();
                console.log(error_2);
                res.status(500).send("Error: ".concat(error_2));
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
exports.app.listen(api_server_1.PORT, function () {
    console.log("Server is running on port: ".concat(api_server_1.PORT));
});
