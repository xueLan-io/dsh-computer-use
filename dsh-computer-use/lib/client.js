/* DSH web client half of dsh-computer-use.
 *
 * Registers a tiny permission bubble just above the composer (aligned to the
 * right edge of the chat card) so the user can allow/deny desktop control
 * without leaving the chat. Permission state lives in the `computer-use`
 * settings namespace on the Host, but the browser cannot read that namespace
 * through the generic settings wire (Host api-proxy allowlist), so this
 * client talks to the plugin's own `/computer-use` loopback RPC channel.
 */
window.__ModuleLoader__.load({
  id: 'dsh-computer-use',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var react = require('react');
    var runtime = require('@deepseek-ai/dsh-client-runtime/client');
    var h = react.createElement;

    var RPC_CHANNEL = '/computer-use';
    var CSS_ID = 'dsh-computer-use-permission-bubble';

    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') === null) {
      var style = document.createElement('style');
      style.dataset.pluginCss = CSS_ID;
      style.textContent = [
        // 容器与聊天卡片同宽，气泡靠右；放在 input.dock 里不会和
        // 右下角悬浮的“✨文生图”按钮重叠。
        '.dsh-cu-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) * 2 - var(--dsh-composer-dock-inset) * 2);',
        'max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) * 2);',
        'margin:0 auto;padding:0 var(--dsh-composer-dock-inset);',
        'display:flex;justify-content:flex-end;flex:none}',
        '.dsh-cu-bubble{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;',
        'border-radius:999px;border:1px solid var(--dsw-alias-border-l2);',
        'background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);',
        'font-size:12px;line-height:18px;cursor:pointer;',
        'transition:border-color .15s ease,background .15s ease,color .15s ease}',
        '.dsh-cu-bubble:hover{background:var(--dsw-alias-interactive-bg-hover)}',
        '.dsh-cu-bubble--on{border-color:var(--dsw-static-neutral-bluish-400);',
        'color:var(--dsw-alias-label-primary)}',
        '.dsh-cu-bubble-dot{display:inline-flex;align-items:center;justify-content:center;',
        'width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-module-input,rgba(0,0,0,.06));',
        'color:#fff;font-size:10px;font-weight:700;line-height:1}',
        '.dsh-cu-bubble--on .dsh-cu-bubble-dot{background:var(--dsw-static-neutral-bluish-400)}',
        '.dsh-cu-bubble-text{white-space:nowrap}'
      ].join('');
      document.head.appendChild(style);
    }

    function definePermissionStore() {
      return runtime.defineStore({
        init: () => ({ allowed: false, revision: -1 }),
        actions: {
          sync: (d, allowed, revision) => {
            if (revision <= d.revision) return;
            d.allowed = allowed;
            d.revision = revision;
          },
        },
      });
    }

    function PermissionBubble(props) {
      var useStore = props.useStore;
      var setAllowed = props.setAllowed;
      var allowed = useStore(function (s) { return s.allowed; });
      return h(
        'div',
        { className: 'dsh-cu-dock' },
        [
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-cu-bubble' + (allowed ? ' dsh-cu-bubble--on' : ''),
              'aria-pressed': allowed,
              title: allowed ? '已授权 DSH 控制你的电脑（点击取消授权）' : '未授权 DSH 控制你的电脑（点击授权）',
              onClick: function () { setAllowed(!allowed); },
            },
            [
              h('span', { className: 'dsh-cu-bubble-dot', key: 'dot' }, allowed ? '\u2713' : ''),
              h('span', { className: 'dsh-cu-bubble-text', key: 'text' }, allowed ? '已授权DSH控制电脑' : '点击授权DSH控制'),
            ],
          ),
        ],
      );
    }

    var inject = ['slots', 'connection'];

    function apply(ctx) {
      var connection = ctx.get('connection');
      var store = definePermissionStore();
      var bound = null;
      var revision = 0;

      // 把最新授权状态推给 store（revision 单调递增，确保能越过去重）。
      function push(allowed) {
        if (bound) bound.sync(!!allowed, ++revision);
      }

      // 从宿主读取当前授权状态。
      function refresh() {
        connection.rpc.call(RPC_CHANNEL, 'allowControl/get', {}).then(function (res) {
          if (res && res.ok) {
            push(!!(res.value && res.value.allowed));
          }
        }).catch(function () {
          // 读取失败时保持当前显示，不打断聊天。
        });
      }

      // 写授权状态，写成功后立即回读并刷新气泡。
      function setAllowed(allowed) {
        return connection.rpc.call(RPC_CHANNEL, 'allowControl/set', { allowed: !!allowed }).then(function (res) {
          if (res && res.ok) {
            push(!!(res.value && res.value.allowed));
          }
        }).catch(function () {
          // 写入失败保持原状；用户再次点击即可重试。
        });
      }

      // conversation.input.dock 是 session 作用域：带 store 时框架调用
      // inject(sessionId, actions)，不是 inject(actions)。
      var injected = function (sessionId, actions) {
        bound = actions;
        refresh();
        return {
          setAllowed: setAllowed,
        };
      };

      ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register(
          {
            name: 'conversation.input.dock',
            id: 'dsh-computer-use-permission',
            order: 10,
            store: store,
            inject: injected,
          },
          PermissionBubble,
        );
      });

      // 预热一次授权状态（即使槽位尚未挂载也不影响后续刷新）。
      refresh();
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
