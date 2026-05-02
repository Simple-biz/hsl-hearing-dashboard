-- Adds the `link_editor` role — narrow scope: edit chronicle_link AND
-- claimant_link only. Used for assignees who need both link edits without
-- inheriting the broader chronicle_editor scope.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'link_editor';
