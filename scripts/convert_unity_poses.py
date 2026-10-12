"""Convert Unity humanoid .anim YAML → VRM-compatible JSON pose files.

Each .anim stores m_FloatCurves with humanoid muscle attributes (normalised -1..1).
We read the value at time 0, convert muscles to VRM humanoid bone rotations via
Unity's default HumanTrait muscle limits, and output {bone: [x,y,z,w]} quaternions
for vrm.humanoid.setNormalizedPose.

Usage:  python scripts/convert_unity_poses.py
"""
from __future__ import annotations

import json, math, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ANIM_ROOT = ROOT / "frontend" / "animation_sources" / "unity"
OUT_DIR = ROOT / "frontend" / "public" / "animations" / "poses"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Unity default HumanTrait muscle limits (min_deg, max_deg) ──────────────
# Value -1..1 maps linearly: angle = v*max if v>=0 else -v*min
MUSCLE_LIMITS: dict[str, tuple[float, float]] = {
    "Spine Front-Back": (-40, 40),
    "Spine Left-Right": (-40, 40),
    "Spine Twist Left-Right": (-40, 40),
    "Chest Front-Back": (-40, 40),
    "Chest Left-Right": (-40, 40),
    "Chest Twist Left-Right": (-40, 40),
    "UpperChest Front-Back": (-20, 20),
    "UpperChest Left-Right": (-20, 20),
    "UpperChest Twist Left-Right": (-20, 20),
    "Neck Nod Down-Up": (-40, 40),
    "Neck Tilt Left-Right": (-40, 40),
    "Neck Turn Left-Right": (-40, 40),
    "Head Nod Down-Up": (-40, 40),
    "Head Tilt Left-Right": (-40, 40),
    "Head Turn Left-Right": (-40, 40),
    "Left Eye Down-Up": (-10, 15),
    "Left Eye In-Out": (-20, 20),
    "Right Eye Down-Up": (-10, 15),
    "Right Eye In-Out": (-20, 20),
    "Jaw Close": (-10, 10),
    "Jaw Left-Right": (-10, 10),
    "Left Upper Leg Front-Back": (-90, 50),
    "Left Upper Leg In-Out": (-60, 60),
    "Left Upper Leg Twist In-Out": (-60, 60),
    "Left Lower Leg Stretch": (-80, 80),
    "Left Lower Leg Twist In-Out": (-60, 60),
    "Left Foot Up-Down": (-50, 50),
    "Left Foot Twist In-Out": (-30, 30),
    "Left Toes Up-Down": (-50, 50),
    "Right Upper Leg Front-Back": (-90, 50),
    "Right Upper Leg In-Out": (-60, 60),
    "Right Upper Leg Twist In-Out": (-60, 60),
    "Right Lower Leg Stretch": (-80, 80),
    "Right Lower Leg Twist In-Out": (-60, 60),
    "Right Foot Up-Down": (-50, 50),
    "Right Foot Twist In-Out": (-30, 30),
    "Right Toes Up-Down": (-50, 50),
    "Left Shoulder Down-Up": (-15, 30),
    "Left Shoulder Front-Back": (-15, 15),
    "Left Arm Down-Up": (-60, 100),
    "Left Arm Front-Back": (-100, 100),
    "Left Arm Twist In-Out": (-90, 90),
    "Left Forearm Stretch": (-80, 80),
    "Left Forearm Twist In-Out": (-90, 90),
    "Left Hand Down-Up": (-40, 40),
    "Left Hand In-Out": (-20, 20),
    "Right Shoulder Down-Up": (-15, 30),
    "Right Shoulder Front-Back": (-15, 15),
    "Right Arm Down-Up": (-60, 100),
    "Right Arm Front-Back": (-100, 100),
    "Right Arm Twist In-Out": (-90, 90),
    "Right Forearm Stretch": (-80, 80),
    "Right Forearm Twist In-Out": (-90, 90),
    "Right Hand Down-Up": (-40, 40),
    "Right Hand In-Out": (-20, 20),
}

# Finger muscles: Stretched (-45..45), Spread (-20..20)
for hand in ("LeftHand", "RightHand"):
    for finger in ("Thumb", "Index", "Middle", "Ring", "Little"):
        for seg in ("1", "2", "3"):
            MUSCLE_LIMITS[f"{hand}.{finger}.{seg} Stretched"] = (-45, 45)
        MUSCLE_LIMITS[f"{hand}.{finger}.Spread"] = (-20, 20)

# ── Muscle → VRM bone mapping ─────────────────────────────────────────────
# Each entry: (vrm_bone_name, axis_index, sign)
# axis_index: 0=X(pitch/nod), 1=Y(yaw/twist), 2=Z(roll/tilt)
# sign: 1 or -1 to flip direction for VRM conventions
MUSCLE_TO_BONE: dict[str, tuple[str, int, float]] = {
    "Spine Front-Back": ("spine", 0, 1),
    "Spine Left-Right": ("spine", 2, 1),
    "Spine Twist Left-Right": ("spine", 1, 1),
    "Chest Front-Back": ("chest", 0, 1),
    "Chest Left-Right": ("chest", 2, 1),
    "Chest Twist Left-Right": ("chest", 1, 1),
    "UpperChest Front-Back": ("upperChest", 0, 1),
    "UpperChest Left-Right": ("upperChest", 2, 1),
    "UpperChest Twist Left-Right": ("upperChest", 1, 1),
    "Neck Nod Down-Up": ("neck", 0, 1),
    "Neck Tilt Left-Right": ("neck", 2, 1),
    "Neck Turn Left-Right": ("neck", 1, 1),
    "Head Nod Down-Up": ("head", 0, 1),
    "Head Tilt Left-Right": ("head", 2, 1),
    "Head Turn Left-Right": ("head", 1, 1),
    "Left Upper Leg Front-Back": ("leftUpperLeg", 0, -1),
    "Left Upper Leg In-Out": ("leftUpperLeg", 2, -1),
    "Left Upper Leg Twist In-Out": ("leftUpperLeg", 1, 1),
    "Left Lower Leg Stretch": ("leftLowerLeg", 0, -1),
    "Left Lower Leg Twist In-Out": ("leftLowerLeg", 1, 1),
    "Left Foot Up-Down": ("leftFoot", 0, -1),
    "Left Foot Twist In-Out": ("leftFoot", 1, 1),
    "Left Toes Up-Down": ("leftToes", 0, -1),
    "Right Upper Leg Front-Back": ("rightUpperLeg", 0, -1),
    "Right Upper Leg In-Out": ("rightUpperLeg", 2, 1),
    "Right Upper Leg Twist In-Out": ("rightUpperLeg", 1, -1),
    "Right Lower Leg Stretch": ("rightLowerLeg", 0, -1),
    "Right Lower Leg Twist In-Out": ("rightLowerLeg", 1, -1),
    "Right Foot Up-Down": ("rightFoot", 0, -1),
    "Right Foot Twist In-Out": ("rightFoot", 1, -1),
    "Right Toes Up-Down": ("rightToes", 0, -1),
    "Left Shoulder Down-Up": ("leftShoulder", 2, -1),
    "Left Shoulder Front-Back": ("leftShoulder", 0, 1),
    "Left Arm Down-Up": ("leftUpperArm", 2, -1),
    "Left Arm Front-Back": ("leftUpperArm", 0, 1),
    "Left Arm Twist In-Out": ("leftUpperArm", 1, 1),
    "Left Forearm Stretch": ("leftLowerArm", 0, 1),
    "Left Forearm Twist In-Out": ("leftLowerArm", 1, 1),
    "Left Hand Down-Up": ("leftHand", 0, 1),
    "Left Hand In-Out": ("leftHand", 2, -1),
    "Right Shoulder Down-Up": ("rightShoulder", 2, 1),
    "Right Shoulder Front-Back": ("rightShoulder", 0, 1),
    "Right Arm Down-Up": ("rightUpperArm", 2, 1),
    "Right Arm Front-Back": ("rightUpperArm", 0, 1),
    "Right Arm Twist In-Out": ("rightUpperArm", 1, -1),
    "Right Forearm Stretch": ("rightLowerArm", 0, 1),
    "Right Forearm Twist In-Out": ("rightLowerArm", 1, -1),
    "Right Hand Down-Up": ("rightHand", 0, 1),
    "Right Hand In-Out": ("rightHand", 2, 1),
}

# Finger mappings
_FINGER_BONE_MAP = {
    "LeftHand": {
        "Thumb":  ["leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal"],
        "Index":  ["leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal"],
        "Middle": ["leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal"],
        "Ring":   ["leftRingProximal", "leftRingIntermediate", "leftRingDistal"],
        "Little": ["leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal"],
    },
    "RightHand": {
        "Thumb":  ["rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal"],
        "Index":  ["rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal"],
        "Middle": ["rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal"],
        "Ring":   ["rightRingProximal", "rightRingIntermediate", "rightRingDistal"],
        "Little": ["rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal"],
    },
}

for hand, fingers in _FINGER_BONE_MAP.items():
    for finger, bones in fingers.items():
        for seg_idx, seg in enumerate(("1", "2", "3")):
            MUSCLE_TO_BONE[f"{hand}.{finger}.{seg} Stretched"] = (bones[seg_idx], 2, 1)
        MUSCLE_TO_BONE[f"{hand}.{finger}.Spread"] = (bones[0], 1, 1)


def _euler_to_quat(x: float, y: float, z: float) -> list[float]:
    """Euler XYZ (radians) → quaternion [x,y,z,w]."""
    cx, sx = math.cos(x / 2), math.sin(x / 2)
    cy, sy = math.cos(y / 2), math.sin(y / 2)
    cz, sz = math.cos(z / 2), math.sin(z / 2)
    return [
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
    ]


def _parse_anim(filepath: Path) -> dict[str, float]:
    """Parse Unity .anim YAML cheaply (no YAML library needed).
    Returns {attribute_name: value_at_time_0}."""
    text = filepath.read_text(encoding="utf-8", errors="replace")

    muscles: dict[str, float] = {}
    # Find m_FloatCurves blocks. Two YAML variants exist:
    # v1: "  - curve:" (emote_collector)   v2: "  - serializedVersion: 2\n    curve:" (nizi/chiu)
    blocks = re.split(r"\n  -\s+(?:serializedVersion:\s*\d+\s+)?curve:", text)
    for block in blocks[1:]:
        attr_m = re.search(r"\n    attribute:\s*(.+)", block)
        if not attr_m:
            continue
        attr = attr_m.group(1).strip()

        # Get first keyframe value (time closest to 0)
        val_m = re.search(r"value:\s*([-\d.eE+]+)", block)
        if val_m:
            try:
                muscles[attr] = float(val_m.group(1))
            except ValueError:
                pass

    return muscles


SKIP_PATTERNS = re.compile(r"_\+1$|^None$|^0$|^\+255$|^-255$|^----$|^Empty$|^LoopTime$", re.I)


def convert_one(anim_path: Path, folder_prefix: str) -> str | None:
    """Convert one .anim → one .json pose.  Returns output filename or None if skipped."""
    name = anim_path.stem
    if SKIP_PATTERNS.search(name):
        return None

    muscles = _parse_anim(anim_path)
    if not muscles:
        return None

    # Accumulate per-bone euler angles (radians)
    bone_euler: dict[str, list[float]] = {}  # {bone: [x, y, z]}

    for attr, val in muscles.items():
        mapping = MUSCLE_TO_BONE.get(attr)
        if not mapping:
            continue
        bone, axis, sign = mapping
        limits = MUSCLE_LIMITS.get(attr)
        if not limits:
            continue

        min_deg, max_deg = limits
        angle_deg = val * max_deg if val >= 0 else -val * min_deg
        angle_rad = math.radians(angle_deg) * sign

        if bone not in bone_euler:
            bone_euler[bone] = [0.0, 0.0, 0.0]
        bone_euler[bone][axis] += angle_rad

    if not bone_euler:
        return None

    # Convert to quaternions
    pose: dict[str, list[float]] = {}
    for bone, euler in bone_euler.items():
        q = _euler_to_quat(euler[0], euler[1], euler[2])
        pose[bone] = [round(v, 6) for v in q]

    # Estimate hipsOffsetY for sit/sleep poses
    hips_offset_y = 0.0
    name_lower = name.lower()
    if "sit" in name_lower:
        hips_offset_y = -0.35
    elif "sleep" in name_lower:
        hips_offset_y = -0.65
    # Check RootT.y if present
    if "RootT.y" in muscles:
        root_y = muscles["RootT.y"]
        if root_y < -0.05:
            hips_offset_y = root_y

    result: dict[str, Any] = {"pose": pose}
    if abs(hips_offset_y) > 0.01:
        result["hipsOffsetY"] = round(hips_offset_y, 3)

    out_name = f"{folder_prefix}_{name}.json"
    out_path = OUT_DIR / out_name
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return out_name


def main():
    converted = []
    for folder in sorted(ANIM_ROOT.iterdir()):
        if not folder.is_dir():
            continue
        prefix = folder.name
        for anim in sorted(folder.glob("*.anim")):
            result = convert_one(anim, prefix)
            if result:
                converted.append(result)
                print(f"  OK  {result}")
            else:
                print(f"  SKIP  {prefix}/{anim.stem}")

    print(f"\nConverted {len(converted)} poses to {OUT_DIR}")


if __name__ == "__main__":
    main()
