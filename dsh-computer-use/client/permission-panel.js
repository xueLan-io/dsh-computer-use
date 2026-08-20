/* DSH web client half of dsh-computer-use.
 *
 * The permission control stays in the input dock because it is part of the
 * action boundary: the user can see the current desktop-control capability
 * next to the composer without opening a settings surface.
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
    var CSS_ID = 'dsh-computer-use-permission-panel';

    function installStyles() {
      if (typeof document === 'undefined' || document.querySelector('style[data-plugin-css="' + CSS_ID + '"]') !== null) return;
      var style = document.createElement('style');
      style.dataset.pluginCss = CSS_ID;
      style.textContent = [
        '.dsh-cu-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance,0px) - var(--dsh-composer-side-clearance,0px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));max-width:calc(var(--dsh-composer-card-max-width,760px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px) - var(--dsh-composer-dock-inset,8px));margin:0 auto;min-width:0}',
        '.dsh-cu-panel{box-sizing:border-box;width:100%;min-width:0;position:relative;border:1px solid var(--dsw-alias-border-l1,rgba(128,128,128,.2));border-radius:12px;background:var(--dsw-specific-tip,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#202124);transition:border-color .14s ease,background-color .14s ease}',
        '.dsh-cu-panel--on{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3964fe) 42%,var(--dsw-alias-border-l1,rgba(128,128,128,.2)));background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3964fe) 6%,var(--dsw-specific-tip,var(--dsw-alias-bg-layer-1,#fff)))}',
        '.dsh-cu-panel--pending{border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.22))}',
        '.dsh-cu-main{box-sizing:border-box;display:grid;grid-template-columns:20px minmax(0,1fr) auto auto;align-items:center;gap:8px;width:100%;height:36px;padding:0 7px 0 11px;border:0;border-radius:inherit;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}',
        '.dsh-cu-main:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}',
        '.dsh-cu-main:disabled{cursor:wait}',
        '.dsh-cu-main:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#3964fe);outline-offset:1px}',
        '.dsh-cu-glyph{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--dsw-alias-label-tertiary,#767980)}',
        '.dsh-cu-panel--on .dsh-cu-glyph{color:var(--dsw-alias-state-business-primary,#3964fe)}',
        '.dsh-cu-copy{display:flex;align-items:baseline;gap:8px;min-width:0;overflow:hidden}',
        '.dsh-cu-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,#202124)}',
        '.dsh-cu-detail{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#767980)}',
        '.dsh-cu-status{display:inline-flex;align-items:center;gap:5px;flex:none;min-width:44px;color:var(--dsw-alias-label-tertiary,#767980);font-size:11px;line-height:18px;white-space:nowrap}',
        '.dsh-cu-status--on{color:var(--dsw-alias-state-business-primary,#3964fe)}',
        '.dsh-cu-status--error{color:var(--dsw-alias-state-error-primary,#c13f3f)}',
        '.dsh-cu-statusDot{width:5px;height:5px;border-radius:50%;background:currentColor}',
        '.dsh-cu-status--pending .dsh-cu-statusDot{width:10px;height:10px;border:1.5px solid currentColor;border-right-color:transparent;background:transparent;animation:dsh-cu-spin .7s linear infinite}',
        '.dsh-cu-switch{position:relative;display:inline-flex;align-items:center;flex:none;width:30px;height:18px;padding:2px;box-sizing:border-box;border-radius:10px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.24));transition:background-color .14s ease}',
        '.dsh-cu-switchThumb{display:block;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 2px rgba(0,0,0,.14);transition:transform .14s ease}',
        '.dsh-cu-panel--on .dsh-cu-switch{background:var(--dsw-alias-state-business-primary,#3964fe)}',
        '.dsh-cu-panel--on .dsh-cu-switchThumb{transform:translateX(12px)}',
        '.dsh-cu-error{box-sizing:border-box;margin:0 11px 7px 39px;padding:2px 0;color:var(--dsw-alias-state-error-primary,#c13f3f);font-size:11px;line-height:16px;overflow-wrap:anywhere}',
        '@keyframes dsh-cu-spin{to{transform:rotate(360deg)}}',
        '@media (max-width:560px){.dsh-cu-dock{width:calc(100% - 16px);max-width:none}.dsh-cu-copy{gap:0;display:block}.dsh-cu-detail{display:none}.dsh-cu-status{min-width:auto}.dsh-cu-error{margin-left:39px}}',
        '@media (prefers-reduced-motion:reduce){.dsh-cu-panel,.dsh-cu-switch,.dsh-cu-switchThumb,.dsh-cu-status--pending .dsh-cu-statusDot{transition:none;animation:none}}'
      ].join('');
      document.head.appendChild(style);
    }

    installStyles();

    function DesktopMark() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 2.25, y: 2.5, width: 11.5, height: 8, rx: 1.25, stroke: 'currentColor', strokeWidth: 1.25 }),
        h('path', { d: 'M5.5 13.25h5M8 10.5v2.75', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }));
    }

    function definePermissionStore() {
      return runtime.defineStore({
        init: () => ({ allowed: false, revision: -1, pending: false, error: null }),
        actions: {
          sync: (state, allowed, revision, pending, error) => {
            if (revision <= state.revision) return;
            state.allowed = allowed;
            state.revision = revision;
            state.pending = pending;
            state.error = error;
          },
        },
      });
    }

    function PermissionPanel(props) {
      var snapshot = props.useStore(function (state) { return state; });
      var allowed = snapshot.allowed;
      var pending = snapshot.pending;
      var error = snapshot.error;
      var setAllowed = props.setAllowed;
      var title = allowed ? '电脑控制' : '允许 DSH 控制电脑';
      var detail = allowed ? 'DSH 可以执行鼠标和键盘操作' : '开启后允许执行桌面操作';
      var stateLabel = pending ? '同步中' : (error ? '不可用' : (allowed ? '已开启' : '已关闭'));
      var stateClass = pending ? ' dsh-cu-status--pending' : (error ? ' dsh-cu-status--error' : (allowed ? ' dsh-cu-status--on' : ''));
      return h('div', { className: 'dsh-cu-dock' },
        h('section', {
          className: 'dsh-cu-panel' + (allowed ? ' dsh-cu-panel--on' : '') + (pending ? ' dsh-cu-panel--pending' : ''),
          'aria-label': '电脑控制权限',
          'data-state': pending ? 'pending' : (allowed ? 'on' : 'off'),
        },
          h('button', {
            type: 'button',
            className: 'dsh-cu-main',
            role: 'switch',
            'aria-checked': allowed,
            'aria-busy': pending,
            'aria-label': allowed ? '关闭 DSH 电脑控制' : '开启 DSH 电脑控制',
            disabled: pending,
            title: allowed ? '关闭 DSH 电脑控制' : '开启 DSH 电脑控制',
            onClick: function () { void setAllowed(!allowed); },
          },
            h('span', { className: 'dsh-cu-glyph' }, h(DesktopMark)),
            h('span', { className: 'dsh-cu-copy' },
              h('span', { className: 'dsh-cu-title' }, title),
              h('span', { className: 'dsh-cu-detail' }, detail)),
            h('span', { className: 'dsh-cu-status' + stateClass, 'aria-live': 'polite' },
              h('span', { className: 'dsh-cu-statusDot', 'aria-hidden': 'true' }), stateLabel),
            h('span', { className: 'dsh-cu-switch', 'aria-hidden': 'true' },
              h('span', { className: 'dsh-cu-switchThumb' }))),
          error ? h('div', { className: 'dsh-cu-error', role: 'alert' }, error) : null));
    }

    var inject = ['slots', 'connection'];

    function apply(ctx) {
      var connection = ctx.get('connection');
      var store = definePermissionStore();
      var bound = null;
      var revision = 0;
      var confirmedAllowed = false;
      var requestSerial = 0;

      function push(allowed, pending, error) {
        if (bound) bound.sync(!!allowed, ++revision, !!pending, error || null);
      }

      function refresh() {
        var serial = ++requestSerial;
        push(confirmedAllowed, true, null);
        connection.rpc.call(RPC_CHANNEL, 'allowControl/get', {}).then(function (res) {
          if (serial !== requestSerial) return;
          if (res && res.ok) {
            confirmedAllowed = !!(res.value && res.value.allowed);
            push(confirmedAllowed, false, null);
          } else {
            push(confirmedAllowed, false, '无法读取控制权限，请重试');
          }
        }).catch(function () {
          if (serial === requestSerial) push(confirmedAllowed, false, '无法连接到控制权限服务，请重试');
        });
      }

      function setAllowed(allowed) {
        var next = !!allowed;
        var previous = confirmedAllowed;
        var serial = ++requestSerial;
        push(next, true, null);
        return connection.rpc.call(RPC_CHANNEL, 'allowControl/set', { allowed: next }).then(function (res) {
          if (serial !== requestSerial) return;
          if (res && res.ok) {
            confirmedAllowed = !!(res.value && res.value.allowed);
            push(confirmedAllowed, false, null);
          } else {
            push(previous, false, '控制权限更新失败，请重试');
          }
        }).catch(function () {
          if (serial === requestSerial) push(previous, false, '控制权限更新失败，请重试');
        });
      }

      var injected = function (sessionId, actions) {
        bound = actions;
        refresh();
        return { setAllowed: setAllowed };
      };

      ctx.slots.inject('conversation.input.dock', function () {
        return ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'dsh-computer-use-permission',
          order: 10,
          store: store,
          inject: injected,
        }, PermissionPanel);
      });

      refresh();
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
