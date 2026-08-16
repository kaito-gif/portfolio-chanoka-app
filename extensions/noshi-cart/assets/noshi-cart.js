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
 *
 * ■ のし代・包装料を独立したカート行にした理由(2026-08-14、構成要素#4を作り直し)
 * 当初は Cart Transform の expand でのし代・包装料をバンドルのコンポーネントとして
 * 加算していたが、**expand で展開された行だけカートページのプロパティ表示が
 * 更新されなくなる**不具合が見つかり、アプリ側からの回避策が無かった。
 * expand をやめて、のし代・包装料を通常のカート行として直接 /cart/add.js で
 * 追加する方式に切り替えた(金額は Function の fixedPricePerUnit ではなく、
 * ダミー商品の Admin 上の variant 価格が正になる)。
 *
 * 独立行にすると、これらの行は Dawn の標準カート表示にもそのまま出てしまう
 * (expand を選んだ本来の理由は「顧客が料金行だけ削除できてしまう」ことを
 * 防ぐためだった)。そこで、本ファイルが fee 行を検出して DOM 上で非表示にし、
 * 数量・存在をカートの状態に合わせて自動で追随させる(reconcileFeeLines)。
 * ただしこれは devtools からの直接操作や JS 無効環境までは防げない
 * (次回のページロード・カート更新時に自己修復する、時間差のある保護)。
 * テーマファイル(main-cart-items.liquid)は編集していない。行の非表示は
 * その行の id 規則(`#CartItem-{{ item.index | plus: 1 }}`)に依存している。
 */
(function () {
  'use strict';

  if (window.__noshiCartInitialized) return;
  window.__noshiCartInitialized = true;

  /* Cart Transform の入力クエリが attribute(key: "表書き") を見ていた名残りで、
     Discount Function 側も含めてこのキー名は変えていない。 */
  var PROPERTY_KEYS = {
    title: '表書き',
    name: '名入れ',
    type: 'のし種別',
  };

  /* fee 行を親行に紐付けるための隠しプロパティ。先頭 '_' は Dawn の
     main-cart-items.liquid が `property_first_char != '_'` で除外するため、
     カート画面には表示されない(テーマは編集せず、既存の挙動を利用しているだけ)。 */
  var PARENT_KEY_PROPERTY = '_noshi_parent_key';

  var root = document.querySelector('[data-noshi-root]');
  var FEE_VARIANT_IDS = {
    noshi: (root && root.dataset.noshiFeeVariantId) || '',
    wrap: (root && root.dataset.wrapFeeVariantId) || '',
  };
  /* variant ID を1箇所にまとめておく。設定が読めていなければ独立行の管理機能は無効にし、
     熨斗の入力自体(properties の保存)は従来通り動かす。 */
  var FEE_VARIANT_LIST = [FEE_VARIANT_IDS.noshi, FEE_VARIANT_IDS.wrap].filter(Boolean);

  function sameVariant(a, b) {
    return String(a) === String(b);
  }

  function isFeeVariant(variantId) {
    return FEE_VARIANT_LIST.some(function (id) {
      return sameVariant(id, variantId);
    });
  }

  function lineOf(el) {
    return el && el.closest ? el.closest('[data-noshi-line]') : null;
  }

  function readFields(line) {
    var enabled = line.querySelector('[data-noshi-enabled]');
    var titleEl = line.querySelector('[data-noshi-field="title"]');
    var nameEl = line.querySelector('[data-noshi-field="name"]');
    var typeEl = line.querySelector('[data-noshi-field="type"]:checked');

    /* 熨斗OFFのときは3つとも空文字にする。キーは残るが値が空なら
       カート画面には出ず、金額加算も行われない(のし代・包装料の行を作らない)。 */
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
   * 送信対象の行をサーバー側のカートから特定する。
   *
   * 第一候補は行キー。ただし**キーだけに頼ってはいけない**。
   * 属性を変えると行キーが変わるうえ、このストアでは属性変更後の描画HTMLが
   * 変更前の状態で返ることがあり(上の「なぜ保存後に再読み込みするのか」参照)、
   * その場合ブロックが持つ data-line-key は実在しない古いキーになる。
   * キー照合だけだと「行が見つからない」と誤判定し、保存が黙って不発になる。
   *
   * そこで行の並び順(描画時の index)と variant ID を突き合わせて拾い直す。
   * 本ブロックは cart.items をそのままの順で描画しているため、
   * index と variant が一致すれば同じ行とみなしてよい。
   * variant が食い違うときはカートの中身自体が変わっているので拾わない。
   */
  function resolveLine(cart, line) {
    var key = line.dataset.lineKey;
    for (var i = 0; i < cart.items.length; i++) {
      if (cart.items[i].key === key) return cart.items[i];
    }

    var index = parseInt(line.dataset.lineIndex, 10);
    var variantId = line.dataset.variantId;
    var candidate = cart.items[index];
    if (candidate && sameVariant(candidate.variant_id, variantId)) {
      return candidate;
    }

    return null;
  }

  /*
   * のし代・包装料の行を、カートの実際の中身(cart)と一致するように作り替える。
   *
   * 「欲しい状態」は cart.items から都度計算する(保存済みの状態を別途持たない)。
   * 熨斗が有効な行(fee variant 自身ではなく、表書きが空でない行)ごとに、
   * のし代・包装料をそれぞれ「数量=親行の数量、_noshi_parent_key=親行の現在のキー」で
   * 用意したい、という要求になる。
   *
   * 親行の properties を変えるとキー自体が変わる(リスク3)。そのため古いキーを指す
   * fee 行は、そのキーがもうカートに存在しない時点で自動的に「孤児」として扱われ、
   * 除去対象になる。特別扱いは不要で、この関数を毎回まっさらに評価し直すだけで
   * 追随できる設計にしている。
   */
  function computeWantedFeeLines(cart) {
    var wanted = [];
    cart.items.forEach(function (item) {
      if (isFeeVariant(item.variant_id)) return;
      var title = item.properties && item.properties[PROPERTY_KEYS.title];
      if (!title || !String(title).trim()) return;

      [FEE_VARIANT_IDS.noshi, FEE_VARIANT_IDS.wrap].forEach(function (variantId) {
        if (!variantId) return;
        wanted.push({
          variantId: variantId,
          parentKey: item.key,
          quantity: item.quantity,
        });
      });
    });
    return wanted;
  }

  /*
   * fee variant の行はすべて対象にする(2026-08-14 設計レビューで修正)。
   * fee 商品は CON-04 によりオンラインストアに公開されているため、商品ページの
   * URL を直打ちすれば誰でも親行なしで fee 行をカートに追加できてしまう。
   * 以前は _noshi_parent_key を持つ行だけを対象にしていたため、そうした行が
   * 「孤児」と判定されず、hideFeeRows で非表示にされたまま課金され続けていた。
   * parentKey が空の行は wanted 側と決して一致しない(wanted の parentKey は
   * 常に実在する親行のキー)ため、下の reconcileFeeLines で自動的に
   * toRemove へ回る。特別扱いは不要。
   */
  function existingFeeLines(cart) {
    return cart.items
      .filter(function (item) {
        return isFeeVariant(item.variant_id);
      })
      .map(function (item) {
        return {
          key: item.key,
          variantId: item.variant_id,
          parentKey: (item.properties && item.properties[PARENT_KEY_PROPERTY]) || '',
          quantity: item.quantity,
        };
      });
  }

  function findMatch(list, variantId, parentKey) {
    return list.filter(function (entry) {
      return sameVariant(entry.variantId, variantId) && entry.parentKey === parentKey;
    })[0];
  }

  /*
   * cart の状態から欲しい fee 行の集合を計算し、実際のカートへ反映する。
   * 変更が無ければ何もしない(ネットワークリクエストを発行しない)。
   *
   * 戻り値は「変更を行ったかどうか」の Promise<boolean>。呼び出し側はこれを見て
   * reload するか、静かに反映済みの状態を使い回すかを決める。
   */
  function reconcileFeeLines(cart) {
    if (FEE_VARIANT_LIST.length === 0) return Promise.resolve(false);

    var wanted = computeWantedFeeLines(cart);
    var existing = existingFeeLines(cart);

    var toRemove = existing.filter(function (entry) {
      return !findMatch(wanted, entry.variantId, entry.parentKey);
    });
    var toUpdate = existing.filter(function (entry) {
      var match = findMatch(wanted, entry.variantId, entry.parentKey);
      return match && match.quantity !== entry.quantity;
    });
    var toAdd = wanted.filter(function (entry) {
      return !findMatch(existing, entry.variantId, entry.parentKey);
    });

    if (toRemove.length === 0 && toUpdate.length === 0 && toAdd.length === 0) {
      return Promise.resolve(false);
    }

    var updates = {};
    toRemove.forEach(function (entry) {
      updates[entry.key] = 0;
    });
    toUpdate.forEach(function (entry) {
      var match = findMatch(wanted, entry.variantId, entry.parentKey);
      updates[entry.key] = match.quantity;
    });

    var chain = Promise.resolve();

    /* /cart/update.js は複数行の数量を1リクエストでまとめて変えられる。
       properties は変わらないので、削除(quantity 0)と数量追随はこれで十分。 */
    if (Object.keys(updates).length > 0) {
      chain = chain
        .then(function () {
          return fetch('/cart/update.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ updates: updates }),
          });
        })
        .then(checkCartResponse);
    }

    /* 追加は /cart/add.js に items 配列でまとめて送る。 */
    if (toAdd.length > 0) {
      chain = chain
        .then(function () {
          return fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              items: toAdd.map(function (entry) {
                var properties = {};
                properties[PARENT_KEY_PROPERTY] = entry.parentKey;
                return {
                  id: entry.variantId,
                  quantity: entry.quantity,
                  properties: properties,
                };
              }),
            }),
          });
        })
        .then(checkCartResponse);
    }

    /* いずれかが失敗すれば chain 全体が reject し、呼び出し元(save/passiveReconcile)へ
       伝播する。ここで catch して true を返す(＝成功扱いにする)と、B-1 の不具合が
       再発するため絶対にしない。 */
    return chain.then(function () {
      return true;
    });
  }

  /*
   * fee 行(のし代・包装料自身)をカート画面から非表示にする。
   * Dawn の行IDは `CartItem-{{ item.index | plus: 1 }}`(main-cart-items.liquid、
   * 読むだけで編集はしない)。cart.items の並び順とインデックスを対応させる。
   *
   * ■ index だけで対象を決めてはいけない(2026-08-14 設計レビューで修正)
   * この関数は「カートを取得 → 非表示化 → reconcileFeeLines で差分反映 →
   * 再取得 → 再度非表示化」という流れの中で2回呼ばれる(passiveReconcile 参照)。
   * 2回目に非表示化する対象の DOM は、差分反映**前**に描画されたもの。
   * 差分反映で行の追加・削除が起きるとカート配列の長さと並びが変わり、
   * index と実際の DOM 行の対応が崩れる。そのまま index だけで
   * display:none にすると、無関係な商品行が購入者の画面から消える
   * (復帰処理を持たないため、料金の加算漏れより重大な壊れ方になる)。
   *
   * Dawn の数量入力(main-cart-items.liquid)は `data-quantity-line-key` に
   * その行のカートキーを持っている。これで「index が指す行が、本当にこの
   * fee 行か」を照合してから隠す。**照合できない場合は何もしない**
   * (fee 行が一時的に見えてしまう方が、無関係な商品が消えるより軽微)。
   * この属性もテーマは読むだけで、改変はしていない。
   */
  function hideFeeRows(cart) {
    if (FEE_VARIANT_LIST.length === 0) return;
    cart.items.forEach(function (item, index) {
      if (!isFeeVariant(item.variant_id)) return;
      var row = document.getElementById('CartItem-' + (index + 1));
      if (!row) return;
      var quantityInput = row.querySelector('[data-quantity-line-key]');
      if (!quantityInput || quantityInput.dataset.quantityLineKey !== item.key) return;
      row.style.display = 'none';
    });
  }

  function fetchCart() {
    return fetch('/cart.js', { headers: { Accept: 'application/json' } }).then(function (response) {
      return response.json();
    });
  }

  /*
   * カート更新APIのレスポンスを検証する(2026-08-14 設計レビューで追加)。
   * fetch は HTTP 4xx/5xx を reject しない。検証せずに then へ進むと、
   * 例えば fee 商品が販売チャネル未公開で /cart/add.js が 422 を返しても
   * 「成功」扱いのまま save() が reload してしまい、購入者には熨斗が保存された
   * 画面が出るのにのし代・包装料が課金されない、という気付きにくい壊れ方をする。
   */
  function checkCartResponse(response) {
    return response.json().then(function (data) {
      if (!response.ok || data.status || data.errors) {
        throw new Error((data && (data.description || data.message)) || 'cart request failed');
      }
      return data;
    });
  }

  /*
   * ページ読み込み時、および Dawn が数量±ボタン等でカートセクションのHTMLを
   * 丸ごと差し替えたとき(下の MutationObserver 参照)に呼ぶ「静かな」整合。
   * reload はしない。fee 行の数量追随・孤児の掃除・非表示化だけを行う。
   *
   * ■ 実行中に来た呼び出しを捨てずに1回分キューする(2026-08-16 バグ調査で追加)
   * 以前は reconciling フラグで「実行中なら何もしない」だけだった。ページ読み込み時の
   * 初回 passiveReconcile がまだネットワーク往復中に Dawn の数量±ボタンで
   * MutationObserver が発火すると、その数量変更分の再整合が丸ごと握りつぶされ、
   * のし代・包装料の行の数量が古いまま残ることがあった(2026-08-16、デモ撮影中に観測)。
   * 実行中の呼び出しは「完了後にもう一度だけ最新状態で整合し直す」よう予約する。
   */
  var reconciling = false;
  var reconcilePending = false;
  function passiveReconcile() {
    if (reconciling) {
      reconcilePending = true;
      return;
    }
    reconciling = true;
    fetchCart()
      .then(function (cart) {
        hideFeeRows(cart);
        return reconcileFeeLines(cart);
      })
      .then(function (changed) {
        if (changed) {
          return fetchCart().then(hideFeeRows);
        }
      })
      .catch(function (error) {
        console.error('[noshi-cart] カートの整合に失敗しました', error);
      })
      .finally(function () {
        reconciling = false;
        if (reconcilePending) {
          reconcilePending = false;
          passiveReconcile();
        }
      });
  }

  /*
   * 数量は data-quantity ではなく、送信直前に /cart.js から取り直す。
   * Dawn の数量±ボタンは本ブロックの外側だけを描き替えるため、
   * data-quantity は簡単に古くなる。古い数量を properties と一緒に送ると
   * その値で上書きされ、数量が巻き戻る。
   */
  function save(line) {
    /* 行の特定は resolveLine が行う。ここは描画が壊れていないことの最低限の確認。 */
    if (!line.dataset.lineKey) return;

    var fields = readFields(line);

    /* 熨斗ONなのに表書きが未選択だと、のし代・包装料の行が作られない。先に止める。 */
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

    fetchCart()
      .then(function (cart) {
        var current = resolveLine(cart, line);

        /* 行を特定できないときだけ諦める(別タブでカートを空にした等)。 */
        if (!current) {
          window.location.reload();
          return null;
        }

        return fetch('/cart/change.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            /* ブロックが持つキーではなく、サーバー側で実在が確認できたキーを使う。 */
            id: current.key,
            quantity: current.quantity, // 省略すると数量が1に落ちる
            properties: properties,
          }),
        }).then(function (response) {
          return response.json();
        });
      })
      .then(function (state) {
        if (!state) return null;
        if (state.status || state.errors) {
          throw new Error(state.description || state.message || 'cart change failed');
        }
        /* 親行のキーが変わっている可能性があるため、最新のカートを取り直してから
           のし代・包装料の行を作り替える。 */
        return fetchCart().then(reconcileFeeLines);
      })
      .then(function (result) {
        if (result === null) return;
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

  /*
   * 名入れフィールドが IME 変換中かどうかを追跡する(2026-08-16 バグ調査で追加)。
   * 「保存」ボタンを isComposing 中にクリックすると、click イベント発火のタイミングが
   * ブラウザによっては compositionend より先行し、変換確定前の値のまま
   * readFields() が読み取ってしまう可能性がある
   * (2026-08-15、注文確定後に名入れが空文字になった事象で疑っている経路)。
   * compositionstart/compositionend で「変換中」を明示的に持ち、保存ボタン側で待つ。
   */
  document.addEventListener('compositionstart', function (event) {
    var target = event.target;
    if (!target || !target.matches || !target.matches('[data-noshi-field="name"]')) return;
    target.dataset.composing = 'true';
  });

  document.addEventListener('compositionend', function (event) {
    var target = event.target;
    if (!target || !target.matches || !target.matches('[data-noshi-field="name"]')) return;
    delete target.dataset.composing;
  });

  document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-noshi-save]') : null;
    if (!button) return;

    event.preventDefault();
    var line = lineOf(button);
    if (!line) return;

    var nameEl = line.querySelector('[data-noshi-field="name"]');
    if (nameEl && nameEl.dataset.composing === 'true') {
      /* 変換確定を待ってから保存する。ユーザーの入力自体は妨げない。 */
      nameEl.addEventListener(
        'compositionend',
        function () {
          save(line);
        },
        { once: true }
      );
      return;
    }

    save(line);
  });

  /* 初回の非表示化・整合。 */
  passiveReconcile();

  /*
   * Dawn の数量±ボタン(cart-items.js の CartItems.updateQuantity)は、数量変更のたびに
   * `#main-cart-items` の中身を丸ごと innerHTML で差し替える。差し替え後のHTMLには
   * display:none は乗らないため、都度 hideFeeRows / reconcile をやり直す必要がある。
   *
   * Dawn 内部の pub/sub(PUB_SUB_EVENTS.cartUpdate)はモジュールスコープの ES module で、
   * 素の script から安定して subscribe できる保証が無いため使わない。MutationObserver で
   * DOM の変化そのものを監視する方が、Dawn 側の実装詳細に依存しにくい。
   * reconcile 自身は DOM を書き換えず fetch のみ行うため、監視対象への再帰的な
   * 発火(無限ループ)は起きない。
   */
  var cartItemsContainer = document.getElementById('main-cart-items');
  if (cartItemsContainer && window.MutationObserver) {
    var observer = new MutationObserver(function () {
      passiveReconcile();
    });
    observer.observe(cartItemsContainer, { childList: true, subtree: true });
  }
})();
