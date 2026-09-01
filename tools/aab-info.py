#!/usr/bin/env python3
"""Mostra package, versionCode, versionName e targetSdk de um .aab.

Existe porque o nome do arquivo mente: o `convocados-v2-api36.aab` mirava API 35.
O aapt2 não abre bundle (só APK), então decodificamos o AndroidManifest em
protobuf na mão. Rode SEMPRE antes de subir um lançamento:

    python3 tools/aab-info.py ~/Downloads/convocados-v4.aab

Para APK, o aapt2 resolve:  aapt2 dump badging arquivo.apk
"""
import sys, zipfile

def varint(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1
        r |= (x & 0x7f) << s
        if not x & 0x80:
            return r, i
        s += 7

def fields(b):
    i = 0
    while i < len(b):
        try:
            k, i = varint(b, i)
        except IndexError:
            return
        fn, wt = k >> 3, k & 7
        if wt == 0:
            v, i = varint(b, i); yield fn, v
        elif wt == 2:
            ln, i = varint(b, i); yield fn, b[i:i + ln]; i += ln
        elif wt == 5:
            yield fn, b[i:i + 4]; i += 4
        elif wt == 1:
            yield fn, b[i:i + 8]; i += 8
        else:
            return

def walk(node, out):
    for fn, v in fields(node):
        if fn != 1 or not isinstance(v, bytes):
            continue
        name, attrs = None, []
        for efn, ev in fields(v):
            if efn == 3 and isinstance(ev, bytes):
                name = ev.decode('utf-8', 'replace')
            elif efn == 4 and isinstance(ev, bytes):
                an = av = None
                for afn, avv in fields(ev):
                    if afn == 2 and isinstance(avv, bytes):
                        an = avv.decode('utf-8', 'replace')
                    elif afn == 3 and isinstance(avv, bytes):
                        av = avv.decode('utf-8', 'replace')
                attrs.append((an, av))
            elif efn == 5 and isinstance(ev, bytes):
                walk(ev, out)
        if name:
            out.append((name, attrs))

def main(path):
    with zipfile.ZipFile(path) as z:
        data = z.read('base/manifest/AndroidManifest.xml')
        assinado = [n for n in z.namelist()
                    if n.startswith('META-INF/') and n.endswith(('.RSA', '.EC', '.DSA'))]
    out = []
    walk(data, out)
    quero = {'package', 'versionCode', 'versionName',
             'minSdkVersion', 'targetSdkVersion', 'compileSdkVersion'}
    achado = {}
    for _, attrs in out:
        for an, av in attrs:
            if an in quero and av and an not in achado:
                achado[an] = av
    for k in ('package', 'versionCode', 'versionName',
              'minSdkVersion', 'targetSdkVersion', 'compileSdkVersion'):
        print(f'{k:18} {achado.get(k, "?")}')
    print(f'{"assinado":18} {"sim (" + assinado[0] + ")" if assinado else "NAO"}')

    alvo = achado.get('targetSdkVersion')
    if alvo != '36':
        print(f'\n*** ATENÇÃO: targetSdkVersion={alvo}. A Play exige 36 desde 31/08/2026.')
        print('*** compileSdkVersion NÃO conta — o Google olha o target. Não suba assim.')
        return 1
    return 0

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1]))
