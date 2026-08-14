import urllib.request
import json
import io
from PIL import Image

def test():
    img = Image.new('RGB', (100, 100), color=(255, 100, 50))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    data = buf.getvalue()

    boundary = '----CustomBoundary123'
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="orange_square.png"\r\n'
        f'Content-Type: image/png\r\n\r\n'
    ).encode('utf-8') + data + f'\r\n--{boundary}--\r\n'.encode('utf-8')

    req = urllib.request.Request(
        'http://127.0.0.1:8765/api/ai/upload',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        method='POST'
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        print('HTTP Upload API Response:', result.get('success'), result.get('file', {}).get('name'), result.get('file', {}).get('id'))
        assert result.get('success') is True

if __name__ == '__main__':
    test()
