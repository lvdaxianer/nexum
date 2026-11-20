import { Content, Description, Overlay, Portal, Root, Title } from "@kobalte/core/alert-dialog"
import { splitProps } from "solid-js"

type ConfirmDialogProps = {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * 危险操作确认对话框：确认按钮在请求结束前保持 busy 并禁用，ESC/遮罩/返回可安全退出。
 * @author lvdaxianer@yeah.net
 * @date 2026-11-20
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const [local, others] = splitProps(props, [
    "title",
    "description",
    "confirmLabel",
    "cancelLabel",
    "busy",
    "onConfirm",
  ])
  return (
    <Root {...others}>
      <Portal>
        <Overlay class="confirm-overlay" />
        <Content class="confirm-content">
          <Title class="confirm-title">{local.title}</Title>
          <Description class="confirm-description">{local.description}</Description>
          <div class="confirm-footer">
            <button class="button button-secondary" disabled={local.busy} onClick={() => others.onOpenChange(false)}>
              {local.cancelLabel ?? "返回"}
            </button>
            <button class="button button-danger" disabled={local.busy} onClick={() => local.onConfirm()}>
              {local.busy ? "处理中…" : local.confirmLabel}
            </button>
          </div>
        </Content>
      </Portal>
    </Root>
  )
}
