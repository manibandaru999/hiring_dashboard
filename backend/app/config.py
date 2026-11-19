from pathlib import Path
SOURCE_DIR = Path(__file__).resolve().parents[2] / "source"
DEFAULT_FILE_NAME = "hiring_input2.xlsx"
DATE_COLUMNS = ["Profile Received Date","L1 Date","L2 Date","Client L1 Date","Client L2 Date"]
NUMERIC_COLUMNS = ["Total Experience","Relevant Experience","Current CTC","Expected CTC"]
REQUIRED_COLUMNS = ["Serial Number","CGI Partner","Director","Manager","Profile Received Date","Candidate Name","Contact Number","Email ID","Role Applied","Skills","Total Experience","Relevant Experience","Current CTC","Expected CTC","Current Organization","Employment Status","Payroll Company","Current Location","Preferred Location","Notice Period","Available Time Slot","L1 Panel","L1 Date","L1 Status","L1 Feedback","L2 Panel","L2 Date","L2 Status","L2 Feedback","Client L1 Panel","Client L1 Date","Client L1 Status","Client L1 Feedback","Client L2 Panel","Client L2 Date","Client L2 Status","Client L2 Feedback","Overall Status","Final Comments"]
WAITING_STAGES = ["Waiting for L1","Cleared L1 - Waiting for L2","Cleared L2 - Waiting for Client L1","Cleared Client L1 - Waiting for Client L2","Client L2 Completed - Waiting for Final Decision"]
