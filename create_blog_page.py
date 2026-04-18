#! ./venv/bin/python
from markdown2 import Markdown
import argparse, sys
from page_template import create_page_template


markdowner = Markdown()

if __name__ == "__main__":
    arser = argparse.ArgumentParser()
    arser.add_argument("file_path", type=str, help="Path to the Markdown file to convert")
    args = arser.parse_args()
    with open(args.file_path, "r") as f:
        md = f.read()
    html_content = markdowner.convert(md)
    with open(f'{args.file_path.replace(".md", ".html")}', "w") as f:
        f.write(create_page_template(html_content))
    sys.exit(0)