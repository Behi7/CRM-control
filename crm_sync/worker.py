import os
import sys

# Ensure current directory is on python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.worker import main

if __name__ == "__main__":
    main()
