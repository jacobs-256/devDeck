// @ts-nocheck
import styles from './RegexHelp.module.css';

interface RegexHelpProps {
  onClose: () => void;
}

export default function RegexHelp({ onClose }: RegexHelpProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span>Regular Expression Help</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <h2>What is a regular expression?</h2>
          <p>
            A regular expression (regex) is a pattern language used to match and extract text. It is commonly
            used for validation, searching, replacement, and parsing.
          </p>

          <div className={styles.threeCol}>
            <div>
              <h3>Common tokens</h3>
              <table className={styles.refTable}>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>.</code>
                    </td>
                    <td>Any character except newline</td>
                  </tr>
                  <tr>
                    <td>
                      <code>\\d</code>
                    </td>
                    <td>Digit</td>
                  </tr>
                  <tr>
                    <td>
                      <code>\\w</code>
                    </td>
                    <td>Word character (letter/digit/_)</td>
                  </tr>
                  <tr>
                    <td>
                      <code>\\s</code>
                    </td>
                    <td>Whitespace</td>
                  </tr>
                  <tr>
                    <td>
                      <code>^</code>
                    </td>
                    <td>Start of input</td>
                  </tr>
                  <tr>
                    <td>
                      <code>$</code>
                    </td>
                    <td>End of input</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3>Quantifiers</h3>
              <table className={styles.refTable}>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>*</code>
                    </td>
                    <td>0 or more</td>
                  </tr>
                  <tr>
                    <td>
                      <code>+</code>
                    </td>
                    <td>1 or more</td>
                  </tr>
                  <tr>
                    <td>
                      <code>?</code>
                    </td>
                    <td>0 or 1</td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        {'{'}n{'}'}
                      </code>
                    </td>
                    <td>Exactly n</td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        {'{'}n,{'}'}
                      </code>
                    </td>
                    <td>At least n</td>
                  </tr>
                  <tr>
                    <td>
                      <code>
                        {'{'}n,m{'}'}
                      </code>
                    </td>
                    <td>Between n and m</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3>Groups & lookarounds</h3>
              <table className={styles.refTable}>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>(exp)</code>
                    </td>
                    <td>Capture group</td>
                  </tr>
                  <tr>
                    <td>
                      <code>(?:exp)</code>
                    </td>
                    <td>Non-capturing group</td>
                  </tr>
                  <tr>
                    <td>
                      <code>(?=exp)</code>
                    </td>
                    <td>Positive lookahead</td>
                  </tr>
                  <tr>
                    <td>
                      <code>(?!exp)</code>
                    </td>
                    <td>Negative lookahead</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h3>Character classes</h3>
          <table className={styles.refTable}>
            <thead>
              <tr>
                <th>Token</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>[abc]</code>
                </td>
                <td>One of a/b/c</td>
              </tr>
              <tr>
                <td>
                  <code>[a-z]</code>
                </td>
                <td>Lowercase letter</td>
              </tr>
              <tr>
                <td>
                  <code>[^x]</code>
                </td>
                <td>Any character except x</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
