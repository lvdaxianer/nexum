import { CloseButton, Content, Description, Overlay, Portal, Root, Title, Trigger } from "@kobalte/core/dialog"
import { type JSXElement, Show, splitProps } from "solid-js"

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
 * 左侧抽屉：基于 Kobalte Dialog 的左侧面板，遮罩、焦点约束、ESC 关闭由组件库处理。
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
export function Drawer(props: DrawerProps) {
  const [local, others] = splitProps(props, ["title", "description", "triggerClass", "trigger", "children"])
  return (
    <Root {...others}>
      <Trigger class={local.triggerClass ?? "drawer-trigger"}>{local.trigger}</Trigger>
      <Portal>
        <Overlay class="drawer-overlay" />
        <Content class="drawer-content">
          <div class="drawer-header">
            <div>
              <Title class="drawer-title">{local.title}</Title>
              <Show when={local.description}>
                <Description class="drawer-description">{local.description}</Description>
              </Show>
            </div>
            <CloseButton class="drawer-close" aria-label="关闭抽屉">
              ✕
            </CloseButton>
          </div>
          <div class="drawer-body">{local.children}</div>
        </Content>
      </Portal>
    </Root>
  )
}
