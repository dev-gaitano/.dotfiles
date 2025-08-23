local M = {}

function M.preview_link()
	local cursor = vim.api.nvim_win_get_cursor(0)
	local line = vim.api.nvim_get_current_line()
	local col = cursor[2]

	local start_col = line:sub(1, col):find("%[%[[^%]]*$")
	local end_col = line:find("%]%]", col)
	if not (start_col and end_col) then
		print("No valid wikilink under cursor")
		return
	end

	local link = line:sub(start_col + 2, end_col - 1)
	local client = require("obsidian").get_client()

	client:find_notes_async(link, function(notes)
		local note = notes and notes[1]
		if not note then
			print("Note not found: " .. link)
			return
		end

		vim.schedule(function()
			vim.cmd("botright vsplit " .. vim.fn.fnameescape(path))
		end)
	end)
end

return M
