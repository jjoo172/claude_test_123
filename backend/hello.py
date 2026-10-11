"""The Python "backend": produces the greeting shown on the page.

In the browser this module is executed by Pyodide; locally it runs with
`python3 backend/hello.py`.
"""


def hello() -> str:
    return "Hello, World!"


if __name__ == "__main__":
    print(hello())
