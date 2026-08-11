/**
 * MusicFree 安卓插件：网易云
 * 版本：2.3.0
 *
 * 专为 MusicFree Android 调整：
 * - 避免高版本可选链、空值合并、对象展开、异步箭头函数等安卓 JS 引擎容易出问题的语法；
 * - 使用 MusicFree 内置 axios / crypto-js / qs；
 * - MUSIC_U 同时写入 EAPI 加密 header，尽量减少 Android 网络层对 Cookie header 的影响；
 * - 所有账号请求只发往网易云官方 *.music.163.com 域名；
 * - 不使用第三方解析服务器，不替换音源，不绕过 VIP/付费/DRM/地区/版权限制；
 * - 不签到、不修改收藏/歌单、不刷听歌时长、不调用播放上报接口。
 */

var axios = require("axios");
var CryptoJS = require("crypto-js");
var qs = require("qs");

var PLATFORM = "网易云";
var VERSION = "2.3.0";
var PAGE_SIZE = 30;

var WEB_BASE = "https://music.163.com";
var API_BASE = "https://interface.music.163.com";
var EAPI_BASE = "https://interfacepc.music.163.com";

var WEB_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

var EAPI_UA =
  "NeteaseMusic/9.5.61.260802021928(9005061);Dalvik/2.1.0 " +
  "(Linux; U; Android 13)";

var EAPI_KEY = "e82ckenh8dichen8";

var FALLBACK_TOPLISTS = [
  { id: "19723756", title: "飙升榜", description: "网易云音乐飙升榜" },
  { id: "3779629", title: "新歌榜", description: "网易云音乐新歌榜" },
  { id: "3778678", title: "热歌榜", description: "网易云音乐热歌榜" },
  { id: "2884035", title: "原创榜", description: "网易云音乐原创榜" }
];

var HOT_TAGS = [
  "全部",
  "华语",
  "欧美",
  "流行",
  "摇滚",
  "民谣",
  "电子",
  "轻音乐",
  "说唱",
  "ACG",
  "学习",
  "工作",
  "运动",
  "夜晚"
];

/* =========================================================
 * 基础工具
 * ========================================================= */

function getUserVariables() {
  try {
    if (
      typeof env !== "undefined" &&
      env &&
      typeof env.getUserVariables === "function"
    ) {
      return env.getUserVariables() || {};
    }
  } catch (e) {}
  return {};
}

function parseCookieString(raw) {
  var result = {};
  var parts = String(raw || "").split(";");
  var i;
  var part;
  var pos;
  var key;
  var value;

  for (i = 0; i < parts.length; i += 1) {
    part = parts[i];
    pos = part.indexOf("=");
    if (pos <= 0) {
      continue;
    }

    key = part.slice(0, pos).trim();
    value = part.slice(pos + 1).trim();

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 支持：
 * 1) 仅 MUSIC_U 的 Value
 * 2) MUSIC_U=xxxx
 * 3) 完整 Cookie
 */
function getAuth() {
  var vars = getUserVariables();
  var raw = String(vars.netease_cookie || "").trim();
  var parsed;

  if (!raw) {
    return {
      raw: "",
      MUSIC_U: "",
      csrf: ""
    };
  }

  if (raw.indexOf("=") < 0) {
    return {
      raw: "MUSIC_U=" + raw,
      MUSIC_U: raw,
      csrf: ""
    };
  }

  parsed = parseCookieString(raw);

  return {
    raw: raw,
    MUSIC_U: parsed.MUSIC_U || "",
    csrf: parsed.__csrf || ""
  };
}

function hasLogin() {
  return !!getAuth().MUSIC_U;
}

function stableDeviceId() {
  var token = getAuth().MUSIC_U || "musicfree-netease-android";
  var hash = CryptoJS.MD5(token).toString();
  return "00" + hash.slice(0, 30);
}

function leftPad4(n) {
  var s = String(n);
  while (s.length < 4) {
    s = "0" + s;
  }
  return s;
}

function makeRequestId() {
  return String(Date.now()) + "_" + leftPad4(Math.floor(Math.random() * 1000));
}

function asString(v) {
  if (v === undefined || v === null) {
    return "";
  }
  return String(v);
}

function durationToSeconds(v) {
  var n = Number(v || 0);

  if (!isFinite(n) || n <= 0) {
    return undefined;
  }

  if (n > 10000) {
    return Math.floor(n / 1000);
  }

  return Math.floor(n);
}

function mergeObjects(a, b) {
  var result = {};
  var key;

  if (a) {
    for (key in a) {
      if (Object.prototype.hasOwnProperty.call(a, key)) {
        result[key] = a[key];
      }
    }
  }

  if (b) {
    for (key in b) {
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        result[key] = b[key];
      }
    }
  }

  return result;
}

function isOfficialNeteaseUrl(url) {
  var text = String(url || "").toLowerCase();

  return (
    text.indexOf("https://music.163.com/") === 0 ||
    text.indexOf("https://interface.music.163.com/") === 0 ||
    text.indexOf("https://interfacepc.music.163.com/") === 0
  );
}

/* =========================================================
 * 官方请求
 * ========================================================= */

async function officialRequest(config, attachLogin) {
  var cfg = mergeObjects({}, config || {});
  var headers = mergeObjects(
    {
      Accept: "application/json, text/plain, */*",
      Referer: "https://music.163.com/",
      "User-Agent": WEB_UA
    },
    cfg.headers || {}
  );
  var auth;

  if (!isOfficialNeteaseUrl(cfg.url)) {
    throw new Error("安全模式阻止了非网易云官方域名请求");
  }

  if (attachLogin !== false) {
    auth = getAuth();
    if (auth.raw) {
      headers.Cookie = auth.raw;
    }
  }

  cfg.headers = headers;
  cfg.timeout = cfg.timeout || 15000;

  return axios(cfg);
}

/* =========================================================
 * 数据转换
 * ========================================================= */

function normalizeArtists(song) {
  if (!song) {
    return [];
  }

  return song.ar || song.artists || song.singers || [];
}

function normalizeAlbum(song) {
  if (!song) {
    return {};
  }

  return song.al || song.album || {};
}

function toMusicItem(song) {
  var artists;
  var album;
  var singerList = [];
  var artistNames = [];
  var i;
  var artist;
  var fee;

  if (!song || song.id === undefined || song.id === null) {
    return null;
  }

  artists = normalizeArtists(song);
  album = normalizeAlbum(song);

  for (i = 0; i < artists.length; i += 1) {
    artist = artists[i] || {};
    if (artist.name) {
      artistNames.push(artist.name);
    }

    singerList.push({
      id: asString(artist.id),
      name: artist.name || "",
      avatar: artist.picUrl || artist.img1v1Url || ""
    });
  }

  fee = song.fee;

  if (
    fee === undefined &&
    song.privilege &&
    song.privilege.fee !== undefined
  ) {
    fee = song.privilege.fee;
  }

  return {
    id: asString(song.id),
    title: song.name || song.title || "",
    artist: artistNames.join(" / "),
    singerList: singerList,
    album: album.name || "",
    albumId: asString(album.id),
    artwork: album.picUrl || album.picUrl_https || "",
    duration: durationToSeconds(song.dt || song.duration),
    fee: fee
  };
}

function toSheetItem(p) {
  var artist = "";

  if (!p || p.id === undefined || p.id === null) {
    return null;
  }

  if (p.creator) {
    artist = p.creator.nickname || p.creator.name || "";
  }

  if (!artist) {
    artist = p.updateFrequency || "";
  }

  return {
    id: asString(p.id),
    title: p.name || p.title || "",
    artist: artist,
    description: p.description || p.intro || "",
    artwork: p.coverImgUrl || p.coverUrl || "",
    coverImg: p.coverImgUrl || p.coverUrl || "",
    playCount: Number(p.playCount || 0),
    worksNum: Number(p.trackCount || 0),
    updateFrequency: p.updateFrequency || ""
  };
}

function mapMusicItems(list) {
  var result = [];
  var i;
  var item;

  list = list || [];

  for (i = 0; i < list.length; i += 1) {
    item = toMusicItem(list[i]);
    if (item) {
      result.push(item);
    }
  }

  return result;
}

function mapSheetItems(list) {
  var result = [];
  var i;
  var item;

  list = list || [];

  for (i = 0; i < list.length; i += 1) {
    item = toSheetItem(list[i]);
    if (item) {
      result.push(item);
    }
  }

  return result;
}

/* =========================================================
 * 榜单
 * ========================================================= */

async function getTopLists() {
  var res;
  var list;
  var sheets;
  var fallback = [];
  var i;
  var x;

  try {
    res = await officialRequest(
      {
        method: "GET",
        url: WEB_BASE + "/api/toplist/detail"
      },
      true
    );

    list = res.data && res.data.list ? res.data.list : [];
    sheets = mapSheetItems(list);

    if (sheets.length) {
      return [
        {
          title: "网易云音乐",
          data: sheets
        }
      ];
    }
  } catch (e) {}

  for (i = 0; i < FALLBACK_TOPLISTS.length; i += 1) {
    x = FALLBACK_TOPLISTS[i];
    fallback.push({
      id: x.id,
      title: x.title,
      description: x.description,
      artwork: "",
      coverImg: ""
    });
  }

  return [
    {
      title: "网易云音乐",
      data: fallback
    }
  ];
}

async function getPlaylistDetailById(id) {
  var res = await officialRequest(
    {
      method: "GET",
      url: WEB_BASE + "/api/v3/playlist/detail",
      params: {
        id: id,
        n: 5000,
        s: 8
      }
    },
    true
  );

  if (res.data && res.data.playlist) {
    return res.data.playlist;
  }

  if (res.data && res.data.result) {
    return res.data.result;
  }

  return {};
}

async function getTopListDetail(topListItem) {
  var playlist = await getPlaylistDetailById(topListItem.id);
  var tracks = playlist.tracks || [];

  return {
    isEnd: true,
    topListItem: {
      id: topListItem.id,
      title: playlist.name || topListItem.title || "",
      description:
        playlist.description || topListItem.description || "",
      artwork: playlist.coverImgUrl || topListItem.artwork || "",
      coverImg: playlist.coverImgUrl || topListItem.coverImg || "",
      playCount: Number(
        playlist.playCount || topListItem.playCount || 0
      ),
      updateFrequency: topListItem.updateFrequency || ""
    },
    musicList: mapMusicItems(tracks)
  };
}

/* =========================================================
 * 推荐歌单
 * ========================================================= */

async function getRecommendSheetTags() {
  var tags = [];
  var i;

  for (i = 0; i < HOT_TAGS.length; i += 1) {
    tags.push({
      id: HOT_TAGS[i],
      title: HOT_TAGS[i]
    });
  }

  return {
    pinned: [
      { id: "全部", title: "热门" },
      { id: "华语", title: "华语" },
      { id: "欧美", title: "欧美" },
      { id: "流行", title: "流行" },
      { id: "摇滚", title: "摇滚" }
    ],
    data: [
      {
        title: "分类",
        data: tags
      }
    ]
  };
}

async function getRecommendSheetsByTag(tag, page) {
  var p = Math.max(1, Number(page || 1));
  var cat = tag && tag.id ? tag.id : "全部";
  var res = await officialRequest(
    {
      method: "GET",
      url: WEB_BASE + "/api/playlist/list",
      params: {
        cat: cat,
        order: "hot",
        limit: PAGE_SIZE,
        offset: (p - 1) * PAGE_SIZE,
        total: "true"
      }
    },
    true
  );

  var list = [];

  if (res.data && res.data.playlists) {
    list = res.data.playlists;
  } else if (
    res.data &&
    res.data.data &&
    res.data.data.playlists
  ) {
    list = res.data.data.playlists;
  }

  return {
    isEnd:
      list.length < PAGE_SIZE ||
      (res.data && res.data.more === false),
    data: mapSheetItems(list)
  };
}

async function getMusicSheetInfo(sheetItem) {
  var playlist = await getPlaylistDetailById(sheetItem.id);
  var tracks = playlist.tracks || [];
  var creator = playlist.creator || {};

  return {
    isEnd: true,
    sheetItem: {
      id: sheetItem.id,
      title: playlist.name || sheetItem.title || "",
      artist:
        creator.nickname ||
        sheetItem.artist ||
        "",
      description:
        playlist.description || sheetItem.description || "",
      artwork:
        playlist.coverImgUrl || sheetItem.artwork || "",
      coverImg:
        playlist.coverImgUrl || sheetItem.coverImg || "",
      playCount: Number(
        playlist.playCount || sheetItem.playCount || 0
      ),
      worksNum: Number(
        playlist.trackCount || tracks.length || 0
      )
    },
    musicList: mapMusicItems(tracks)
  };
}

/* =========================================================
 * 搜索
 * ========================================================= */

async function search(query, page, type) {
  var p = Math.max(1, Number(page || 1));
  var keyword = String(query || "").trim();
  var searchType;
  var res;
  var result;
  var list;

  if (!keyword) {
    return {
      isEnd: true,
      data: []
    };
  }

  searchType = type === "sheet" ? 1000 : 1;

  res = await officialRequest(
    {
      method: "POST",
      url: WEB_BASE + "/api/search/get/web",
      data: qs.stringify({
        s: keyword,
        type: searchType,
        limit: PAGE_SIZE,
        offset: (p - 1) * PAGE_SIZE
      }),
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded;charset=UTF-8"
      }
    },
    true
  );

  result =
    res.data && res.data.result ? res.data.result : {};

  if (type === "sheet") {
    list = result.playlists || [];

    return {
      isEnd: list.length < PAGE_SIZE,
      data: mapSheetItems(list)
    };
  }

  list = result.songs || [];

  return {
    isEnd: list.length < PAGE_SIZE,
    data: mapMusicItems(list)
  };
}

/* =========================================================
 * 歌词与详情
 * ========================================================= */

async function getLyric(musicItem) {
  var res;

  try {
    res = await officialRequest(
      {
        method: "GET",
        url: WEB_BASE + "/api/song/lyric",
        params: {
          id: musicItem.id,
          lv: -1,
          kv: -1,
          tv: -1
        }
      },
      true
    );

    return {
      rawLrc:
        res.data &&
        res.data.lrc &&
        res.data.lrc.lyric
          ? res.data.lrc.lyric
          : "",
      translation:
        res.data &&
        res.data.tlyric &&
        res.data.tlyric.lyric
          ? res.data.tlyric.lyric
          : ""
    };
  } catch (e) {
    return null;
  }
}

async function getMusicInfo(musicItem) {
  var res;
  var songs;

  try {
    res = await officialRequest(
      {
        method: "GET",
        url: WEB_BASE + "/api/song/detail",
        params: {
          id: musicItem.id,
          ids: "[" + musicItem.id + "]"
        }
      },
      true
    );

    songs =
      res.data && res.data.songs ? res.data.songs : [];

    if (!songs.length) {
      return null;
    }

    return toMusicItem(songs[0]);
  } catch (e) {
    return null;
  }
}

/* =========================================================
 * EAPI 加密
 * ========================================================= */

function aesEcbHex(text, key) {
  var encrypted = CryptoJS.AES.encrypt(
    CryptoJS.enc.Utf8.parse(text),
    CryptoJS.enc.Utf8.parse(key),
    {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    }
  );

  return encrypted.ciphertext.toString().toUpperCase();
}

function eapiEncrypt(apiPath, object) {
  var text = JSON.stringify(object);
  var message =
    "nobody" + apiPath + "use" + text + "md5forencrypt";
  var digest = CryptoJS.MD5(message).toString();
  var payload =
    apiPath +
    "-36cd479b6b5-" +
    text +
    "-36cd479b6b5-" +
    digest;

  return {
    params: aesEcbHex(payload, EAPI_KEY)
  };
}

function makeEapiHeader() {
  var auth = getAuth();
  var header = {
    osver: "13",
    deviceId: stableDeviceId(),
    os: "android",
    appver: "9.5.61",
    versioncode: "9005061",
    mobilename: "Android",
    buildver: String(Math.floor(Date.now() / 1000)),
    resolution: "1080x2400",
    __csrf: auth.csrf || "",
    channel: "netease",
    requestId: makeRequestId()
  };

  /*
   * Android 网络层可能会自行处理 Cookie header。
   * 所以 MUSIC_U 除了放进 HTTP Cookie，也放进 EAPI
   * 加密数据中的 header，减少单纯依赖 Cookie header。
   */
  if (auth.MUSIC_U) {
    header.MUSIC_U = auth.MUSIC_U;
  }

  return header;
}

function cookieHeaderFromObject(obj) {
  var parts = [];
  var key;
  var value;

  for (key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      value = obj[key];
      if (value === undefined || value === null) {
        value = "";
      }

      parts.push(
        encodeURIComponent(key) +
          "=" +
          encodeURIComponent(String(value))
      );
    }
  }

  return parts.join("; ");
}

function qualityLevels(quality) {
  if (quality === "low") {
    return ["standard"];
  }

  if (quality === "standard") {
    return ["exhigh", "standard"];
  }

  if (quality === "high") {
    return ["lossless", "exhigh", "standard"];
  }

  if (quality === "super") {
    return ["hires", "lossless", "exhigh", "standard"];
  }

  return ["exhigh", "standard"];
}

function legacyBitrates(quality) {
  if (quality === "low") {
    return [128000];
  }

  if (quality === "standard") {
    return [320000, 192000, 128000];
  }

  return [999000, 320000, 192000, 128000];
}

/* =========================================================
 * 播放 URL 判定
 * ========================================================= */

function isTrialMedia(row) {
  var trial;
  var privilege;

  if (!row) {
    return false;
  }

  trial = row.freeTrialInfo;

  if (
    trial &&
    trial !== "null" &&
    trial !== "NULL" &&
    trial !== "undefined"
  ) {
    return true;
  }

  privilege = row.freeTimeTrialPrivilege;

  if (
    privilege &&
    typeof privilege === "object" &&
    (
      privilege.resConsumable === true ||
      privilege.userConsumable === true
    )
  ) {
    return true;
  }

  return false;
}

function isHttpUrl(url) {
  var text = String(url || "").toLowerCase();

  return (
    text.indexOf("https://") === 0 ||
    text.indexOf("http://") === 0
  );
}

function isUsableMediaRow(row) {
  if (!row || !row.url) {
    return false;
  }

  if (isTrialMedia(row)) {
    return false;
  }

  return isHttpUrl(row.url);
}

/* =========================================================
 * EAPI V1：账号授权音质
 * ========================================================= */

async function requestEapiMedia(songId, level) {
  var auth = getAuth();
  var apiPath = "/api/song/enhance/player/url/v1";
  var header;
  var data;
  var encrypted;
  var res;
  var rows;
  var row;

  if (!auth.MUSIC_U) {
    return null;
  }

  header = makeEapiHeader();

  data = {
    ids: "[" + songId + "]",
    level: level,
    encodeType: "flac",
    header: header
  };

  encrypted = eapiEncrypt(apiPath, data);

  res = await axios({
    method: "POST",
    url:
      EAPI_BASE +
      "/eapi/song/enhance/player/url/v1",
    timeout: 15000,
    data: qs.stringify(encrypted),
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://music.163.com/",
      "Content-Type":
        "application/x-www-form-urlencoded;charset=utf-8",
      "User-Agent": EAPI_UA,
      Cookie: cookieHeaderFromObject(header),
      "X-Music-U": auth.MUSIC_U
    }
  });

  rows =
    res.data && res.data.data && Array.isArray(res.data.data)
      ? res.data.data
      : [];

  row = rows.length ? rows[0] : null;

  if (isUsableMediaRow(row)) {
    return row;
  }

  return null;
}

/* =========================================================
 * 旧版官方 POST：兼容回退
 * ========================================================= */

async function requestLegacyMedia(songId, br) {
  var auth = getAuth();
  var headers = {
    Accept: "application/json, text/plain, */*",
    Referer: "https://music.163.com/",
    "Content-Type":
      "application/x-www-form-urlencoded;charset=utf-8",
    "User-Agent": WEB_UA
  };
  var res;
  var rows;
  var row;

  if (auth.raw) {
    headers.Cookie = auth.raw;
  }

  res = await axios({
    method: "POST",
    url: API_BASE + "/api/song/enhance/player/url",
    timeout: 15000,
    data: qs.stringify({
      ids: JSON.stringify([String(songId)]),
      br: Number(br)
    }),
    headers: headers
  });

  rows =
    res.data && res.data.data && Array.isArray(res.data.data)
      ? res.data.data
      : [];

  row = rows.length ? rows[0] : null;

  if (isUsableMediaRow(row)) {
    return row;
  }

  return null;
}

/* =========================================================
 * MusicFree 播放入口
 * ========================================================= */

async function getMediaSource(mediaItem, quality) {
  var levels;
  var bitrates;
  var i;
  var row;

  if (!mediaItem || !mediaItem.id) {
    return null;
  }

  /*
   * 先走账号授权接口。
   * MUSIC_U 无效或账号无权播放时，网易云不会返回完整 URL。
   */
  if (hasLogin()) {
    levels = qualityLevels(quality);

    for (i = 0; i < levels.length; i += 1) {
      try {
        row = await requestEapiMedia(
          mediaItem.id,
          levels[i]
        );

        if (row) {
          return {
            url: row.url,
            headers: {
              Referer: "https://music.163.com/"
            }
          };
        }
      } catch (e1) {}
    }
  }

  /*
   * 兼容回退：
   * 即便 MUSIC_U 无效，免费歌曲仍可能通过旧接口播放。
   */
  bitrates = legacyBitrates(quality);

  for (i = 0; i < bitrates.length; i += 1) {
    try {
      row = await requestLegacyMedia(
        mediaItem.id,
        bitrates[i]
      );

      if (row) {
        return {
          url: row.url,
          headers: {
            Referer: "https://music.163.com/"
          }
        };
      }
    } catch (e2) {}
  }

  return null;
}

/* =========================================================
 * 导出
 * ========================================================= */

module.exports = {
  platform: PLATFORM,
  author: "自定义 MusicFree 插件",
  version: VERSION,

  primaryKey: ["id"],
  cacheControl: "no-store",
  supportedSearchType: ["music", "sheet"],

  userVariables: [
    {
      key: "netease_cookie",
      title: "网易云 MUSIC_U / Cookie"
    }
  ],

  hints: {
    importMusicItem: [
      "Android 安全版：只使用你的网易云登录态和账号本身拥有的播放权限。",
      "MUSIC_U / Cookie 属于登录凭证，请只保存在自己的设备。"
    ],
    importMusicSheet: [
      "排行榜与热门歌单会在刷新时重新请求，无需因榜单更新重新安装插件。"
    ]
  },

  search: search,
  getMediaSource: getMediaSource,
  getMusicInfo: getMusicInfo,
  getLyric: getLyric,

  getTopLists: getTopLists,
  getTopListDetail: getTopListDetail,

  getRecommendSheetTags: getRecommendSheetTags,
  getRecommendSheetsByTag: getRecommendSheetsByTag,
  getMusicSheetInfo: getMusicSheetInfo
};
