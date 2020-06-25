using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace vFDIO
{

    public partial class FDIO : Form
    {
        CommandParser CP;
        public FDIO()
        {
            InitializeComponent();
            CP = new CommandParser();

            List.Range(start, (end - start)).Where(v => v.ToString().IndexOfAny(new char[] { '8', '9' }) == -1);

            NasCode ZOA = new NasCode(4201, 4277, 4301, 4377, 3201, 3277, 1701, 1777, 3601, 3602, 0601, 0647);
            ZOA.internalPrimary2Start = 4501;
            ZOA.internalPrimary2End = 4577;
            ZOA.internalSecondary2Start = 5501;
            ZOA.internalSecondary2End = 5577;
            ZOA.internalSecondary3Start = 7001;
            ZOA.internalSecondary3End = 7077;
            ZOA.externalPrimary2Start = 3301;
            ZOA.externalPrimary2End = 3377;
            ZOA.externalSecondary2Start = 3601;
            ZOA.externalSecondary2End = 3677;
            ZOA.externalSecondary3Start = 3701;
            ZOA.externalSecondary3End = 3777;
            ZOA.externalSecondary4Start = 6301;
            ZOA.externalSecondary4End = 6377;
            ZOA.externalTertiary2Start = 2212;
            ZOA.externalTertiary2End = 2235;
            ZOA.externalTertiary3Start = 3001;
            ZOA.externalTertiary3Start = 3020;
            ZOA.externalTertiary4Start = 7441;
            ZOA.externalTertiary4End = 7464;








        }

        private void splitContainer1_SplitterMoved(object sender, SplitterEventArgs e)
        {

        }

        private void textBox1_TextChanged(object sender, EventArgs e)
        {

        }

        private void textBox1_TextChanged_1(object sender, EventArgs e)
        {

        }

        private void FDIO_Load(object sender, EventArgs e)
        {

        }

        private void textBox4_TextChanged(object sender, EventArgs e)
        {

        }

        private void label1_Click(object sender, EventArgs e)
        {

        }

        private void textBox2_TextChanged(object sender, EventArgs e)
        {

        }

        private void textBox1_TextChanged_2(object sender, EventArgs e)
        {

        }

        private void UserInput_KeyDown(object sender, KeyEventArgs e)
        {
            if(e.KeyCode == Keys.Enter)
            {
                bool CommandResult = CP.ParseCommand(UserInput.Text);

                if(CommandResult)
                    UserInput.Text = "";

                Console.WriteLine("Command Entered. Status: " +CommandResult);
            }
        }
    }
    class Fdio
    {
        public string messageType;
        public string facilityType;
        public string facilityName;

    }
}
