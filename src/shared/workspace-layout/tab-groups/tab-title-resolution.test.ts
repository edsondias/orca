import { describe, expect, it } from 'vitest'
import { resolveTerminalTabTitle, resolveUnifiedTabLabel } from './tab-title-resolution'

describe('tab title resolution', () => {
  describe('Claude variant mark', () => {
    const mark = { id: 'v1', label: 'Kimi K3.1' }

    it('prefixes the conversation title with the variant label', () => {
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: '✳ Corrigir o login', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1 · ✳ Corrigir o login')
      expect(
        resolveUnifiedTabLabel(
          { customLabel: null, label: '✳ Corrigir o login', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1 · ✳ Corrigir o login')
    })

    it('shows only the label while Claude has no conversation title', () => {
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: '✳ Claude Code', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1')
      expect(
        resolveTerminalTabTitle({ customTitle: null, title: '', claudeVariant: mark }, false)
      ).toBe('Kimi K3.1')
      expect(
        resolveUnifiedTabLabel(
          { customLabel: null, label: '⠂ Claude Code', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1')
    })

    it('keeps a user rename without the prefix', () => {
      expect(
        resolveTerminalTabTitle({ customTitle: 'Meu', title: 'x', claudeVariant: mark }, false)
      ).toBe('Meu')
      expect(
        resolveUnifiedTabLabel({ customLabel: 'Meu', label: 'x', claudeVariant: mark }, false)
      ).toBe('Meu')
    })

    it('leaves tabs without a mark unchanged', () => {
      expect(resolveTerminalTabTitle({ customTitle: null, title: 'zsh' }, false)).toBe('zsh')
      expect(
        resolveTerminalTabTitle({ customTitle: null, title: 'zsh', claudeVariant: null }, false)
      ).toBe('zsh')
      expect(resolveUnifiedTabLabel({ customLabel: null, label: 'zsh' }, false)).toBe('zsh')
    })

    it('prefixes generated titles ahead of the live title', () => {
      expect(
        resolveTerminalTabTitle(
          {
            customTitle: null,
            generatedTitle: 'Refactor auth',
            title: '✳ Claude Code',
            claudeVariant: mark
          },
          true
        )
      ).toBe('Kimi K3.1 · Refactor auth')
    })

    it('shows only the label while the title is still the default terminal label', () => {
      expect(
        resolveTerminalTabTitle(
          {
            customTitle: null,
            title: 'Terminal 1',
            defaultTitle: 'Terminal 1',
            claudeVariant: mark
          },
          false
        )
      ).toBe('Kimi K3.1')
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: 'bash', defaultTitle: 'bash', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1')
      expect(
        resolveUnifiedTabLabel(
          {
            customLabel: null,
            label: 'Terminal 2',
            defaultTitle: 'Terminal 2',
            claudeVariant: mark
          },
          false
        )
      ).toBe('Kimi K3.1')
    })

    it.each([
      'PS',
      'pwsh',
      'powershell',
      'Windows PowerShell',
      'Administrator: Windows PowerShell',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\WINDOWS\\system32\\cmd.exe',
      'cmd',
      'bash',
      'zsh',
      'MINGW64:/c/repo'
    ])('shows only the label while the shell title %s is up', (shellTitle) => {
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: shellTitle, claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1')
      expect(
        resolveUnifiedTabLabel({ customLabel: null, label: shellTitle, claudeVariant: mark }, false)
      ).toBe('Kimi K3.1')
    })

    it('still prefixes a conversation title that merely mentions a shell', () => {
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: '✳ PS script cleanup', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1 · ✳ PS script cleanup')
    })

    it('recognizes the default terminal name when no default title is available', () => {
      expect(
        resolveUnifiedTabLabel(
          { customLabel: null, label: 'Terminal 3', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1')
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: 'Terminal 3', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1')
    })

    it('still prefixes a real conversation title next to a default title', () => {
      expect(
        resolveTerminalTabTitle(
          {
            customTitle: null,
            title: '✳ Corrigir o login',
            defaultTitle: 'Terminal 1',
            claudeVariant: mark
          },
          false
        )
      ).toBe('Kimi K3.1 · ✳ Corrigir o login')
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: 'Terminal 1', defaultTitle: 'Terminal 1' },
          false
        )
      ).toBe('Terminal 1')
    })

    it('does not prefix a title that already carries the mark', () => {
      const prefixed = resolveTerminalTabTitle(
        { customTitle: null, title: '✳ Corrigir o login', claudeVariant: mark },
        false
      )
      expect(
        resolveTerminalTabTitle({ customTitle: null, title: prefixed, claudeVariant: mark }, false)
      ).toBe(prefixed)
      expect(
        resolveTerminalTabTitle(
          { customTitle: null, title: 'Kimi K3.1', claudeVariant: mark },
          false
        )
      ).toBe('Kimi K3.1')
    })
  })
})
