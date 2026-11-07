## Base64 Encoding/Decoding

Base64 is a group of binary-to-text encoding schemes that represent binary data using 64 printable characters. Since log<sub>2</sub>64 = 6, every 6 bits map to a single character. Three bytes (24 bits) are represented by four Base64 characters. The 64 printable characters include A-Z, a-z, 0-9 (62 characters), plus two additional symbols that vary by implementation.

Base64 is commonly used to encode binary data for storage and transfer over media designed to handle text, including MIME email and XML complex data.

### RFC 4648 Standard Base64 Index Table

<div class="table-wrap">
<table class="index-table">
<thead>
<tr><th>Dec</th><th>Binary</th><th>Char</th><th>Dec</th><th>Binary</th><th>Char</th><th>Dec</th><th>Binary</th><th>Char</th><th>Dec</th><th>Binary</th><th>Char</th></tr>
</thead>
<tbody>
<tr><td>0</td><td>000000</td><td>A</td><td>16</td><td>010000</td><td>Q</td><td>32</td><td>100000</td><td>g</td><td>48</td><td>110000</td><td>w</td></tr>
<tr><td>1</td><td>000001</td><td>B</td><td>17</td><td>010001</td><td>R</td><td>33</td><td>100001</td><td>h</td><td>49</td><td>110001</td><td>x</td></tr>
<tr><td>2</td><td>000010</td><td>C</td><td>18</td><td>010010</td><td>S</td><td>34</td><td>100010</td><td>i</td><td>50</td><td>110010</td><td>y</td></tr>
<tr><td>3</td><td>000011</td><td>D</td><td>19</td><td>010011</td><td>T</td><td>35</td><td>100011</td><td>j</td><td>51</td><td>110011</td><td>z</td></tr>
<tr><td>4</td><td>000100</td><td>E</td><td>20</td><td>010100</td><td>U</td><td>36</td><td>100100</td><td>k</td><td>52</td><td>110100</td><td>0</td></tr>
<tr><td>5</td><td>000101</td><td>F</td><td>21</td><td>010101</td><td>V</td><td>37</td><td>100101</td><td>l</td><td>53</td><td>110101</td><td>1</td></tr>
<tr><td>6</td><td>000110</td><td>G</td><td>22</td><td>010110</td><td>W</td><td>38</td><td>100110</td><td>m</td><td>54</td><td>110110</td><td>2</td></tr>
<tr><td>7</td><td>000111</td><td>H</td><td>23</td><td>010111</td><td>X</td><td>39</td><td>100111</td><td>n</td><td>55</td><td>110111</td><td>3</td></tr>
<tr><td>8</td><td>001000</td><td>I</td><td>24</td><td>011000</td><td>Y</td><td>40</td><td>101000</td><td>o</td><td>56</td><td>111000</td><td>4</td></tr>
<tr><td>9</td><td>001001</td><td>J</td><td>25</td><td>011001</td><td>Z</td><td>41</td><td>101001</td><td>p</td><td>57</td><td>111001</td><td>5</td></tr>
<tr><td>10</td><td>001010</td><td>K</td><td>26</td><td>011010</td><td>a</td><td>42</td><td>101010</td><td>q</td><td>58</td><td>111010</td><td>6</td></tr>
<tr><td>11</td><td>001011</td><td>L</td><td>27</td><td>011011</td><td>b</td><td>43</td><td>101011</td><td>r</td><td>59</td><td>111011</td><td>7</td></tr>
<tr><td>12</td><td>001100</td><td>M</td><td>28</td><td>011100</td><td>c</td><td>44</td><td>101100</td><td>s</td><td>60</td><td>111100</td><td>8</td></tr>
<tr><td>13</td><td>001101</td><td>N</td><td>29</td><td>011101</td><td>d</td><td>45</td><td>101101</td><td>t</td><td>61</td><td>111101</td><td>9</td></tr>
<tr><td>14</td><td>001110</td><td>O</td><td>30</td><td>011110</td><td>e</td><td>46</td><td>101110</td><td>u</td><td>62</td><td>111110</td><td>+</td></tr>
<tr><td>15</td><td>001111</td><td>P</td><td>31</td><td>011111</td><td>f</td><td>47</td><td>101111</td><td>v</td><td>63</td><td>111111</td><td>/</td></tr>
</tbody>
<tfoot><tr><td colspan="3">Padding</td><td colspan="9">=</td></tr></tfoot>
</table>
</div>

## Example

Consider this quote from Thomas Hobbes's _Leviathan_:

> Man is distinguished, not only by his reason, but by this singular passion from other animals, which is a lust of the mind, that by a perseverance of delight in the continued and indefatigable generation of knowledge, exceeds the short vehemence of any carnal pleasure.

After Base64 encoding:

> TWFuIGlzIGRpc3Rpbmd1aXNoZWQsIG5vdCBvbmx5IGJ5IGhpcyByZWFzb24sIGJ1dCBieSB0aGlzIHNpbmd1bGFyIHBhc3Npb24gZnJvbSBvdGhlciBhbmltYWxzLCB3aGljaCBpcyBhIGx1c3Qgb2YgdGhlIG1pbmQsIHRoYXQgYnkgYSBwZXJzZXZlcmFuY2Ugb2YgZGVsaWdodCBpbiB0aGUgY29udGludWVkIGFuZCBpbmRlZmF0aWdhYmxlIGdlbmVyYXRpb24gb2Yga25vd2xlZGdlLCBleGNlZWRzIHRoZSBzaG9ydCB2ZWhlbWVuY2Ugb2YgYW55IGNhcm5hbCBwbGVhc3VyZS4=

Encoding "Man" produces TWFu. Here is a detailed breakdown:

<div class="table-wrap">
<table class="example-table">
<tbody>
<tr><th>Text</th><td colspan="8">M</td><td colspan="8">a</td><td colspan="8">n</td></tr>
<tr><th>ASCII</th><td colspan="8">77</td><td colspan="8">97</td><td colspan="8">110</td></tr>
<tr><th>Bits</th><td>0</td><td>1</td><td>0</td><td>0</td><td>1</td><td>1</td><td>0</td><td>1</td><td>0</td><td>1</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>0</td><td>1</td><td>1</td><td>0</td><td>1</td><td>1</td><td>1</td><td>0</td></tr>
<tr><th>Index</th><td colspan="6">19</td><td colspan="6">22</td><td colspan="6">5</td><td colspan="6">46</td></tr>
<tr><th>Base64</th><td colspan="6">T</td><td colspan="6">W</td><td colspan="6">F</td><td colspan="6">u</td></tr>
</tbody>
</table>
</div>

This shows how Base64 encodes every 3 bytes into 4 characters.

When the input length is not a multiple of 3, padding is applied. Zero bytes are appended to make it divisible by 3, then `=` signs are added to the encoded output to indicate the padding. Two remaining bytes produce one `=`; one remaining byte produces `==`. See below:

<div class="table-wrap">
<table class="example-table">
<tbody>
<tr><th>Text (1 Byte)</th><td colspan="8">A</td><td colspan="8"></td><td colspan="8"></td></tr>
<tr><th>Bits</th><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
<tr><th>Bits (padded)</th><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td class="pad-cell">0</td><td class="pad-cell">0</td><td class="pad-cell">0</td><td class="pad-cell">0</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><th>Base64</th><td colspan="6">Q</td><td colspan="6">Q</td><td colspan="6">=</td><td colspan="6">=</td></tr>
</tbody>
</table>
</div>

<div class="table-wrap">
<table class="example-table">
<tbody>
<tr><th>Text (2 Bytes)</th><td colspan="8">B</td><td colspan="8">C</td><td colspan="8"></td></tr>
<tr><th>Bits</th><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>0</td><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
<tr><th>Bits (padded)</th><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>0</td><td>0</td><td>1</td><td>0</td><td>0</td><td>0</td><td>0</td><td>1</td><td>1</td><td class="pad-cell">0</td><td class="pad-cell">0</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><th>Base64</th><td colspan="6">Q</td><td colspan="6">k</td><td colspan="6">M</td><td colspan="6">=</td></tr>
</tbody>
</table>
</div>

## Applications

### Variants

The 64 characters used in standard Base64 may not be suitable for all contexts, particularly the characters at position 62 (`+`), 63 (`/`), and the padding character (`=`). Several variants exist:

<div class="table-wrap">
<table class="variant-table">
<thead>
<tr><th>Encoding</th><th>Pos 62</th><th>Pos 63</th><th>Padding</th><th>Separator</th><th>Line Length</th></tr>
</thead>
<tbody>
<tr><td>RFC 1421: PEM</td><td>+</td><td>/</td><td>= mandatory</td><td>CR+LF</td><td>64</td></tr>
<tr><td>RFC 2045: MIME</td><td>+</td><td>/</td><td>= mandatory</td><td>CR+LF</td><td>max 76</td></tr>
<tr><td>RFC 2152: UTF-7</td><td>+</td><td>/</td><td>No</td><td></td><td></td></tr>
<tr><td>RFC 3501: IMAP</td><td>+</td><td>,</td><td>No</td><td></td><td></td></tr>
<tr><td>RFC 4648§4: Standard</td><td>+</td><td>/</td><td>= optional</td><td></td><td></td></tr>
<tr><td>RFC 4648§5: base64url</td><td>-</td><td>_</td><td>= optional</td><td></td><td></td></tr>
<tr><td>RFC 4880: OpenPGP Radix-64</td><td>+</td><td>/</td><td>= mandatory</td><td>CR+LF</td><td>max 76</td></tr>
</tbody>
</table>
</div>

### MIME

In MIME-formatted email, Base64 encodes binary byte sequences into ASCII text. The character set includes 26 uppercase letters, 26 lowercase letters, 10 digits, `+` and `/` (64 characters total), with `=` used for padding.

The full Base64 specification is defined in RFC 1421 and RFC 2045. Encoded data is approximately 4/3 the size of the original. Per RFC 822, a line break is inserted every 76 characters, making the total overhead roughly 135.1%.

### URL

Base64 can encode long identifiers for use in HTTP parameters. However, standard Base64 is not URL-safe because `/` and `+` are percent-encoded by URL encoders.

The URL-safe variant (base64url) omits `=` padding and replaces `+` with `-` and `/` with `_`, avoiding issues with URL encoding and database storage.
