// @ts-nocheck
import { useEscapeClose } from '../../../ui/useEscapeClose';
import styles from './RegexHelp.module.css';
import { useI18n } from '../../../i18n';

interface RegexHelpProps {
  onClose: () => void;
}

export default function RegexHelp({ onClose }: RegexHelpProps) {
  useEscapeClose(onClose);
  const { locale } = useI18n();
  const tr = (en: string, zh: string) => (locale === 'zh-CN' ? zh : en);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={tr('Regular expression help', '正则表达式帮助')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span>{tr('Regular Expression Help', '正则表达式帮助')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label={tr('Close', '关闭')}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <h2>{tr('What is a regular expression?', '什么是正则表达式？')}</h2>
          <p>
            {tr(
              'A regular expression (regex) is a pattern language used to match and extract text. It is commonly used for validation, searching, replacement, and parsing.',
              '正则表达式是一种用于匹配和提取文本的模式语言，常用于校验、搜索、替换和解析。',
            )}
          </p>

          <div className={styles.threeCol}>
            <div>
              <h3>{tr('Common tokens', '常用元字符')}</h3>
              <table className={styles.refTable}>
                <thead>
                  <tr>
                    <th>{tr('Token', '符号')}</th>
                    <th>{tr('Meaning', '含义')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>.</code>
                    </td>
                    <td>{tr('Any character except newline', '除换行外的任意字符')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>\\d</code>
                    </td>
                    <td>{tr('Digit', '数字')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>\\w</code>
                    </td>
                    <td>{tr('Word character (letter/digit/_)', '单词字符（字母/数字/_）')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>\\s</code>
                    </td>
                    <td>{tr('Whitespace', '空白字符')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>^</code>
                    </td>
                    <td>{tr('Start of input', '输入开始')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>$</code>
                    </td>
                    <td>{tr('End of input', '输入结束')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3>{tr('Quantifiers', '量词')}</h3>
              <table className={styles.refTable}>
                <thead>
                  <tr>
                    <th>{tr('Token', '符号')}</th>
                    <th>{tr('Meaning', '含义')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>*</code>
                    </td>
                    <td>{tr('0 or more', '0 次或多次')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>+</code>
                    </td>
                    <td>{tr('1 or more', '1 次或多次')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>?</code>
                    </td>
                    <td>{tr('0 or 1', '0 次或 1 次')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        {'{'}n{'}'}
                      </code>
                    </td>
                    <td>{tr('Exactly n', '恰好 n 次')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        {'{'}n,{'}'}
                      </code>
                    </td>
                    <td>{tr('At least n', '至少 n 次')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        {'{'}n,m{'}'}
                      </code>
                    </td>
                    <td>{tr('Between n and m', 'n 到 m 次')}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3>{tr('Groups & lookarounds', '分组与环视')}</h3>
              <table className={styles.refTable}>
                <thead>
                  <tr>
                    <th>{tr('Token', '符号')}</th>
                    <th>{tr('Meaning', '含义')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>(exp)</code>
                    </td>
                    <td>{tr('Capture group', '捕获分组')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>(?:exp)</code>
                    </td>
                    <td>{tr('Non-capturing group', '非捕获分组')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>(?=exp)</code>
                    </td>
                    <td>{tr('Positive lookahead', '正向先行断言')}</td>
                  </tr>
                  <tr>
                    <td>
                      <code>(?!exp)</code>
                    </td>
                    <td>{tr('Negative lookahead', '负向先行断言')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h3>{tr('Character classes', '字符类')}</h3>
          <table className={styles.refTable}>
            <thead>
              <tr>
                <th>{tr('Token', '符号')}</th>
                <th>{tr('Meaning', '含义')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>[abc]</code>
                </td>
                <td>{tr('One of a/b/c', 'a/b/c 之一')}</td>
              </tr>
              <tr>
                <td>
                  <code>[a-z]</code>
                </td>
                <td>{tr('Lowercase letter', '小写字母')}</td>
              </tr>
              <tr>
                <td>
                  <code>[^x]</code>
                </td>
                <td>{tr('Any character except x', '除 x 外的任意字符')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
