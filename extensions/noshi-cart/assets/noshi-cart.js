/*
 * 構成要素#1「のし入力ブロック」のカート更新処理。
 *
 * ■ /cart/change.js の罠(リスク3で実測)
 *  1. properties を送るときに quantity を省略すると、その行の数量が黙って 1 に落ちる。
 *     → 必ず現在の数量を添えて送る。
 *  2. properties は全置換。一部のキーだけ送ると他のキーが消える。
 *     → 表書き・名入れ・のし種別は常に3つまとめて送る。
 *  3. line の番号は「後から追加した行が先頭」で追加順と一致しない。
 *     → 行の指定は key で行う。
 *
 * 属性のキー自体は削除できない(空文字を送るとキーは残り値だけが空になる)。
 * ただし空値は Dawn のカート画面に表示されず、Cart Transform 側も trim() で無視するため、
 * 「熨斗を外す」は空文字を送るだけで正しく外れる。
 *
 * ■ なぜ保存後にページを再読み込みするのか(2026-08-14 実測)
 * **line item properties を変更した直後は、サーバーが返すHTMLが軒並み古い。**
 * change.js の sections も、?section_id= も、フルページの fetch も、変更前の状態を返す
 * (cache: 'no-store' もキャッシュバスターも効かず、8秒ポーリングしても更新されなかった)。
 * 一方 /cart.js と change.js 応答の items は常に正しい。つまりデータは即座に正しく、
 * **描画用HTMLだけが遅れる**。数量変更では最新HTMLが返るため Dawn 標準の数量±ボタンは
 * 正常に動く。この非対称が原因の切り分けを難しくする。
 *
 * 結果として、変更を画面へ確実に反映する手段は実ナビゲーションしか無かった。
 * そのため入力は行ごとの「保存」ボタンでまとめて1回だけ送り、成功後に reload する。
 * 変更のたびに送る即時保存だと、そのたびに再読み込みが走って使い物にならない。
 */
(function () {
  'use strict';

  if (window.__noshiCartInitialized) return;
  window.__noshiCartInitialized = true;

  /* Cart Transform の入力クエリが attribute(key: "表書き") を見ているため、
     このキー名は Function 側と一致していなければならない。 */
  var PROPERTY_KEYS = {
    title: '表書き',
    name: '名入れ',
    type: 'のし種別',
  };

  function lineOf(el) {
    return el && el.closest ? el.closest('[data-noshi-line]') : null;
  }

  function readFields(line) {
    var enabled = line.querySelector('[data-noshi-enabled]');
    var titleEl = line.querySelector('[data-noshi-field="title"]');
    var nameEl = line.querySelector('[data-noshi-field="name"]');
    var typeEl = line.querySelector('[data-noshi-field="type"]:checked');

    /* 熨斗OFFのときは3つとも空文字にする。キーは残るが値が空なら
       カート画面には出ず、Cart Transform も加算しない。 */
    if (!enabled || !enabled.checked) {
      return { title: '', name: '', type: '' };
    }

    return {
      title: titleEl ? titleEl.value : '',
      name: nameEl ? nameEl.value.trim() : '',
      type: typeEl ? typeEl.value : '',
    };
  }

  function setBusy(line, busy) {
    line.querySelectorAll('input, select, button').forEach(function (el) {
      el.disabled = busy;
    });
  }

  function showError(line, message) {
    var status = line.querySelector('[data-noshi-status]');
    if (status) status.textContent = message;
  }

  function clearError(line) {
    showError(line, '');
  }

  /*
   * 数量は data-quantity ではなく、送信直前に /cart.js から取り直す。
   * Dawn の数量±ボタンは本ブロックの外側だけを描き替えるため、
   * data-quantity は簡単に古くなる。古い数量を properties と一緒に送ると
   * その値で上書きされ、数量が巻き戻る。
   */
  function save(line) {
    var key = line.dataset.lineKey;
    if (!key) return;

    var fields = readFields(line);

    /* 熨斗ONなのに表書きが未選択だと Cart Transform が加算しない。先に止める。 */
    if (fields.title === '' && line.querySelector('[data-noshi-enabled]').checked) {
      showError(line, line.dataset.messageSelectTitle || '表書きを選択してください。');
      return;
    }

    var properties = {};
    properties[PROPERTY_KEYS.title] = fields.title;
    properties[PROPERTY_KEYS.name] = fields.name;
    properties[PROPERTY_KEYS.type] = fields.type;

    clearError(line);
    setBusy(line, true);

    fetch('/cart.js', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.json();
      })
      .then(function (cart) {
        var current = null;
        for (var i = 0; i < cart.items.length; i++) {
          if (cart.items[i].key === key) {
            current = cart.items[i];
            break;
          }
        }

        /* 別タブや戻る操作でカートが変わっていた場合。古い行に書きに行かない。 */
        if (!current) {
          window.location.reload();
          return null;
        }

        return fetch('/cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            id: key,
            quantity: current.quantity, // 省略すると数量が1に落ちる
            properties: properties,
          }),
        }).then(function (response) {
          return response.json();
        });
      })
      .then(function (state) {
        if (!state) return;
        if (state.status || state.errors) {
          throw new Error(state.description || state.message || 'cart change failed');
        }
        /* 保存後のHTMLはサーバー側が古い値を返すため、実ナビゲーションで作り直す。 */
        window.location.reload();
      })
      .catch(function (error) {
        console.error('[noshi-cart] カートの更新に失敗しました', error);
        setBusy(line, false);
        showError(
          line,
          line.dataset.messageSaveFailed ||
            'カートを更新できませんでした。時間をおいて再度お試しください。'
        );
      });
  }

  /* 未保存の変更があることを保存ボタンで示す。押し忘れに気付けるようにする。 */
  function markDirty(line) {
    line.dataset.noshiDirty = 'true';
    var button = line.querySelector('[data-noshi-save]');
    if (button) button.disabled = false;
  }

  document.addEventListener('change', function (event) {
    var target = event.target;
    if (!target || !target.matches) return;
    if (!target.matches('[data-noshi-enabled], [data-noshi-field]')) return;

    var line = lineOf(target);
    if (!line) return;

    if (target.matches('[data-noshi-enabled]')) {
      var fields = line.querySelector('[data-noshi-fields]');
      if (fields) fields.hidden = !target.checked;
    }

    clearError(line);
    markDirty(line);
  });

  /* テキスト入力は change(blur相当)を待たずに、打った時点で未保存だと分かるようにする。 */
  document.addEventListener('input', function (event) {
    var target = event.target;
    if (!target || !target.matches || !target.matches('[data-noshi-field="name"]')) return;
    var line = lineOf(target);
    if (line) markDirty(line);
  });

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-noshi-save]') : null;
    if (!button) return;

    event.preventDefault();
    var line = lineOf(button);
    if (line) save(line);
  });
})();
