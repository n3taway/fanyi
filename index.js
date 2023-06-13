const needle = require('needle');
const chalk = require('chalk');
const SOURCE = require('./lib/source');
const print = require('./lib/print');
const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();
const parseString = require('xml2js').parseString;
const isChinese = require('is-chinese');
const ora = require('ora');
const qs = require('querystringify');
const CryptoJS = require('crypto-js');

function truncate(q) {
  var len = q.length;
  if (len <= 20) return q;
  return q.substring(0, 10) + len + q.substring(len - 10, len);
}

module.exports = function (word, options, callback) {
  console.log('');
  const { say, iciba, youdao, dictionaryapi = false } = options;
  const requestCounts = [iciba, youdao, dictionaryapi].filter(isTrueOrUndefined).length;
  const spinner = ora().start();

  // say it
  try {
    if (!process.env.CI && isTrueOrUndefined(say)) {
      require('say').speak(word, isChinese(word) ? 'Ting-Ting' : null);
    }
  } catch (e) {
    // do nothing
  }

  let count = 0;
  const callbackAll = () => {
    count += 1;
    if (count >= requestCounts) {
      spinner.stop();
      spinner.clear();
      callback && callback();
    }
  };

  const endcodedWord = encodeURIComponent(word);

  // iciba
  isTrueOrUndefined(iciba) &&
    needle.get(
      SOURCE.iciba.replace('${word}', endcodedWord),
      { parse: false },
      function (error, response) {
        if (error) {
          console.log(chalk.yellow(`访问 iciba 失败，请检查网络`));
        } else if (response.statusCode == 200) {
          parseString(response.body, function (err, result) {
            if (err) {
              return;
            }
            print.iciba(result.dict, options);
          });
        }
        callbackAll();
      },
    );

  const appKey = '';
  const key = ''; //注意：暴露appSecret，有被盗用造成损失的风险
  const salt = new Date().getTime();
  const curtime = Math.round(new Date().getTime() / 1000);
  const query = word;
  // 多个query可以用\n连接  如 query='apple\norange\nbanana\npear'
  const from = 'auto';
  const to = 'auto';
  const str1 = appKey + truncate(query) + salt + curtime + key;
  const sign = CryptoJS.SHA256(str1).toString(CryptoJS.enc.Hex);

  const queryData = {
    q: query,
    appKey: appKey,
    salt: salt,
    from: from,
    to: to,
    sign: sign,
    signType: 'v3',
    curtime: curtime,
  };
  const url = `https://openapi.youdao.com/api?${qs.stringify(queryData)}`;

  // youdao
  isTrueOrUndefined(youdao) &&
    needle.get(url, { parse: false }, function (error, response) {
      if (error) {
        console.log(chalk.yellow(`访问 youdao 失败，请检查网络`));
      } else if (response.statusCode == 200) {
        try {
          const data = JSON.parse(entities.decode(response.body));
          print.youdao(data, options);
        } catch (e) {
          // 来自您key的翻译API请求异常频繁，为保护其他用户的正常访问，只能暂时禁止您目前key的访问
        }
      }
      callbackAll();
    });

  print.chatgpt(word, options);
};

function isTrueOrUndefined(val) {
  return val === true || val === undefined;
}
