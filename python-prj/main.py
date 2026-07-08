#!/usr/bin/env python3
"""Точка входа GUI-приложения «Кинонаграды (IMDb)».

Запуск:  python main.py
"""

from app.gui import AwardsApp


def main() -> None:
    app = AwardsApp()
    app.mainloop()


if __name__ == "__main__":
    main()
