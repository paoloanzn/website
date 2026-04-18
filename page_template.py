import argparse, sys

__HEAD_HTML__="""
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>X</title>
    <link rel="shortcut icon" href="https://abs.twimg.com/favicons/twitter.3.ico">
</head>
"""

__BODY_HTML__="""
<body>
    <div style="padding: 32px;">
    {{ content }}
    </div>
</body>
"""

def create_page_template(content: str = "") -> str:
    return f"""
    <!DOCTYPE html>
    <html>
    {__HEAD_HTML__}
    {__BODY_HTML__.replace("{{ content }}", content)}
    </html>
    """


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("name", help="Name of the page", required=True)
    parser.add_argument("--content", type=str, default="", help="Content of the page")
    args = parser.parse_args()
    page = create_page_template(args.content)
    with open(f"{args.name}.html", "w") as f:
        f.write(page)
    sys.exit(0)