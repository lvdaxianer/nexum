import { createEffect, createSignal, type JSXElement, Show } from "solid-js"

type DrawerProps = {
  title: string
  description?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Trigger 按钮的类名，复用侧栏导航项等现有样式。 */
  triggerClass?: string
  trigger: JSXElement
  children: JSXElement
}

/**
 * 右侧抽屉：基于 Kobalte Dialog 的右侧面板，遮罩、焦点约束、ESC 关闭由组件库处理。
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
export function Drawer(props: DrawerProps) {
  const [open, setOpen] = createSignal(props.open)
  createEffect(() => setOpen(props.open))
  const changeOpen = (next: boolean) => {
    setOpen(next)
    props.onOpenChange(next)
  }
  return (
    <>
      <button
        type="button"
        class={props.triggerClass ?? "drawer-trigger"}
        aria-expanded={open()}
        aria-haspopup="dialog"
        onClick={() => changeOpen(!open())}
      >
        {props.trigger}
      </button>
      <Show when={open()}>
        <div class="drawer-overlay" />
        <div class="drawer-content" role="dialog" aria-modal="true" aria-label={props.title}>
          <div class="drawer-header">
            <div>
              <h2 class="drawer-title">{props.title}</h2>
              <Show when={props.description}>
                <p class="drawer-description">{props.description}</p>
              </Show>
            </div>
            <button class="drawer-close" type="button" aria-label="关闭抽屉" onClick={() => changeOpen(false)}>
              ✕
            </button>
          </div>
          <div class="drawer-body">{props.children}</div>
        </div>
      </Show>
    </>
  )
}
